using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);

        try
        {
            using (var capture = CreateCapture(args))
            {
                capture.Run();
            }

            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception.Message);
            return 1;
        }
    }

    private static IAudioCaptureRunner CreateCapture(string[] args)
    {
        var targetAppId = args != null && args.Length > 0 ? args[0] : null;
        var targetAppName = args != null && args.Length > 1 ? args[1] : null;

        if (!string.IsNullOrWhiteSpace(NormalizeMatchToken(targetAppId)) || !string.IsNullOrWhiteSpace(NormalizeMatchToken(targetAppName)))
        {
            return new AppLoopbackSpectrumCapture(targetAppId, targetAppName);
        }

        return new LoopbackSpectrumCapture();
    }

    private static string NormalizeMatchToken(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var token = value.Trim();
        if (token.IndexOf('\n') >= 0)
        {
            token = token.Replace("\n", string.Empty);
        }

        var lastBangIndex = token.LastIndexOf('!');
        if (lastBangIndex >= 0 && lastBangIndex < token.Length - 1)
        {
            token = token.Substring(lastBangIndex + 1);
        }

        token = System.IO.Path.GetFileNameWithoutExtension(System.IO.Path.GetFileName(token));

        var builder = new StringBuilder(token.Length);
        for (var index = 0; index < token.Length; index++)
        {
            var character = char.ToLowerInvariant(token[index]);
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }

    private static void WriteSampleJson(string mode, bool active, float peak, float[] channels, float[] bands)
    {
        var safeChannels = channels ?? new float[0];
        var safeBands = bands ?? new float[0];
        var builder = new StringBuilder(2048);
        builder.Append("{\"mode\":\"");
        builder.Append((mode ?? "host-audio-spectrum").Replace("\\", "\\\\").Replace("\"", "\\\""));
        builder.Append("\",\"active\":");
        builder.Append(active ? "true" : "false");
        builder.Append(",\"peak\":");
        builder.Append(Math.Pow(Clamp(peak, 0f, 1f), 0.78).ToString("0.####", CultureInfo.InvariantCulture));
        builder.Append(",\"updatedAt\":");
        builder.Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        builder.Append(",\"channels\":[");

        for (var channelIndex = 0; channelIndex < safeChannels.Length; channelIndex++)
        {
            if (channelIndex > 0)
            {
                builder.Append(',');
            }

            builder.Append(Math.Pow(Clamp(safeChannels[channelIndex], 0f, 1f), 0.78).ToString("0.####", CultureInfo.InvariantCulture));
        }

        builder.Append("],\"bands\":[");

        for (var bandIndex = 0; bandIndex < safeBands.Length; bandIndex++)
        {
            if (bandIndex > 0)
            {
                builder.Append(',');
            }

            builder.Append(Clamp(safeBands[bandIndex], 0f, 1f).ToString("0.####", CultureInfo.InvariantCulture));
        }

        builder.Append("]}");
        Console.WriteLine(builder.ToString());
    }

    private static long GetCurrentTimeMilliseconds()
    {
        return DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
    }

    private static float Clamp(double value, float minimum, float maximum)
    {
        return (float)Math.Max(minimum, Math.Min(maximum, value));
    }

    private static void ReleaseComObject(object instance)
    {
        if (instance != null && Marshal.IsComObject(instance))
        {
            Marshal.ReleaseComObject(instance);
        }
    }

    [DllImport("Mmdevapi.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern int ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        ref Guid riid,
        ref PROPVARIANT activationParams,
        IntPtr completionHandler,
        out IntPtr activationOperation);

    private interface IAudioCaptureRunner : IDisposable
    {
        void Run();
    }

    private sealed class AppLoopbackSpectrumCapture : IAudioCaptureRunner
    {
        private const int EmitIntervalMs = 50;
        private const int CaptureRefreshIntervalMs = 1000;
        private const int ActivationTimeoutMs = 5000;
        private const int AnalysisSampleCount = 4096;
        private const int SpectrumBandCount = 48;
        private const double MinBandFrequency = 18.0;
        private const double MaxBandFrequency = 16000.0;
        private const long RequestedBufferDuration = 0L;

        private static readonly Guid AudioSessionManager2Guid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        private static readonly Guid AudioClientGuid = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
        private static readonly Guid AudioCaptureClientGuid = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
        private static readonly Guid KsdAudioSubtypePcm = new Guid("00000001-0000-0010-8000-00AA00389B71");
        private static readonly Guid KsdAudioSubtypeFloat = new Guid("00000003-0000-0010-8000-00AA00389B71");

        private readonly string _targetAppId;
        private readonly string _targetAppName;
        private readonly SampleRingBuffer _monoHistory = new SampleRingBuffer(AnalysisSampleCount * 2);
        private readonly float[] _analysisBuffer = new float[AnalysisSampleCount];
        private readonly double[] _fftReal = new double[AnalysisSampleCount];
        private readonly double[] _fftImaginary = new double[AnalysisSampleCount];
        private readonly float[] _spectrumBands = new float[SpectrumBandCount];
        private readonly float[] _inactiveBands = new float[SpectrumBandCount];

        private IMMDeviceEnumerator _enumerator;
        private IMMDevice _device;
        private IAudioSessionManager2 _sessionManager;
        private IntPtr _audioClientPointer = IntPtr.Zero;
        private IntPtr _captureClientPointer = IntPtr.Zero;
        private IntPtr _requestedFormatPointer = IntPtr.Zero;
        private WaveFormatInfo _waveFormat;
        private byte[] _packetBuffer = new byte[0];
        private float[] _channelPeaks = new[] { 0f, 0f };
        private uint _matchedProcessId;
        private long _nextRefreshAt;
        private float _spectrumGain = 28f;
        private bool _started;

        public AppLoopbackSpectrumCapture(string targetAppId, string targetAppName)
        {
            _targetAppId = NormalizeMatchToken(targetAppId);
            _targetAppName = NormalizeMatchToken(targetAppName);
        }

        public void Run()
        {
            InitializeSessionManager();
            TryStartTargetCapture();
            if (_captureClientPointer == IntPtr.Zero)
            {
                RunHostFallback();
                return;
            }

            long nextEmitAt = 0;

            while (true)
            {
                var now = GetCurrentTimeMilliseconds();
                if (now >= _nextRefreshAt)
                {
                    try
                    {
                        RefreshTargetCapture();
                    }
                    catch
                    {
                        ResetActiveCapture();
                        RunHostFallback();
                        return;
                    }
                }

                if (_captureClientPointer != IntPtr.Zero)
                {
                    try
                    {
                        ReadAvailablePackets();
                    }
                    catch
                    {
                        ResetActiveCapture();
                        RunHostFallback();
                        return;
                    }
                }

                now = GetCurrentTimeMilliseconds();
                if (now >= nextEmitAt)
                {
                    EmitCurrentState();
                    nextEmitAt = now + EmitIntervalMs;
                }

                Thread.Sleep(_captureClientPointer != IntPtr.Zero ? 10 : 25);
            }
        }

        public void Dispose()
        {
            ResetActiveCapture();
            ReleaseComObject(_sessionManager);
            ReleaseComObject(_device);
            ReleaseComObject(_enumerator);
        }

        private void InitializeSessionManager()
        {
            _enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            Marshal.ThrowExceptionForHR(_enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out _device));

            object sessionManagerObject;
            var sessionManagerGuid = AudioSessionManager2Guid;
            Marshal.ThrowExceptionForHR(_device.Activate(ref sessionManagerGuid, CLSCTX.ALL, IntPtr.Zero, out sessionManagerObject));
            _sessionManager = (IAudioSessionManager2)sessionManagerObject;
        }

        private void TryStartTargetCapture()
        {
            try
            {
                RefreshTargetCapture();
            }
            catch
            {
                ResetActiveCapture();
            }
        }

        private void RefreshTargetCapture()
        {
            _nextRefreshAt = GetCurrentTimeMilliseconds() + CaptureRefreshIntervalMs;
            var matchedProcessId = FindMatchingProcessId();
            if (matchedProcessId == 0)
            {
                ResetActiveCapture();
                return;
            }

            if (_captureClientPointer != IntPtr.Zero && matchedProcessId == _matchedProcessId)
            {
                return;
            }

            ResetActiveCapture();
            ActivateProcessCapture(matchedProcessId);
            _matchedProcessId = matchedProcessId;
        }

        private uint FindMatchingProcessId()
        {
            uint fallbackProcessId = 0;

            IAudioSessionEnumerator sessionEnumerator = null;

            try
            {
                Marshal.ThrowExceptionForHR(_sessionManager.GetSessionEnumerator(out sessionEnumerator));

                int sessionCount;
                Marshal.ThrowExceptionForHR(sessionEnumerator.GetCount(out sessionCount));

                for (var index = 0; index < sessionCount; index++)
                {
                    IAudioSessionControl sessionControl = null;

                    try
                    {
                        Marshal.ThrowExceptionForHR(sessionEnumerator.GetSession(index, out sessionControl));

                        var sessionControl2 = sessionControl as IAudioSessionControl2;
                        if (sessionControl2 == null)
                        {
                            continue;
                        }

                        uint processId;
                        Marshal.ThrowExceptionForHR(sessionControl2.GetProcessId(out processId));

                        string displayName;
                        if (sessionControl.GetDisplayName(out displayName) != 0)
                        {
                            displayName = null;
                        }

                        string sessionIdentifier;
                        if (sessionControl2.GetSessionIdentifier(out sessionIdentifier) != 0)
                        {
                            sessionIdentifier = null;
                        }

                        string sessionInstanceIdentifier;
                        if (sessionControl2.GetSessionInstanceIdentifier(out sessionInstanceIdentifier) != 0)
                        {
                            sessionInstanceIdentifier = null;
                        }

                        if (!IsTargetMatch(
                            TryGetProcessName((int)processId),
                            displayName,
                            sessionIdentifier,
                            sessionInstanceIdentifier))
                        {
                            continue;
                        }

                        AudioSessionState sessionState;
                        if (sessionControl2.GetState(out sessionState) == 0 && sessionState == AudioSessionState.Active)
                        {
                            return processId;
                        }

                        if (fallbackProcessId == 0)
                        {
                            fallbackProcessId = processId;
                        }
                    }
                    catch
                    {
                    }
                    finally
                    {
                        if (sessionControl != null)
                        {
                            ReleaseComObject(sessionControl);
                        }
                    }
                }
            }
            finally
            {
                ReleaseComObject(sessionEnumerator);
            }

            return fallbackProcessId;
        }

        private void ActivateProcessCapture(uint processId)
        {
            var activationHandler = new RawActivateAudioInterfaceCompletionHandler();
            var activationBlobSize = Marshal.SizeOf(typeof(AUDIOCLIENT_ACTIVATION_PARAMS));
            var activationBlobPointer = Marshal.AllocHGlobal(activationBlobSize);
            IntPtr activationOperationPointer = IntPtr.Zero;

            try
            {
                var activationParams = new AUDIOCLIENT_ACTIVATION_PARAMS
                {
                    ActivationType = AudioClientActivationType.ProcessLoopback,
                    ProcessLoopbackParams = new AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
                    {
                        TargetProcessId = processId,
                        ProcessLoopbackMode = ProcessLoopbackMode.IncludeTargetProcessTree
                    }
                };

                Marshal.StructureToPtr(activationParams, activationBlobPointer, false);

                var activationVariant = PROPVARIANT.CreateBlob(activationBlobPointer, activationBlobSize);
                var audioClientGuid = AudioClientGuid;
                Marshal.ThrowExceptionForHR(ActivateAudioInterfaceAsync(
                    VirtualAudioDeviceProcessLoopback,
                    ref audioClientGuid,
                    ref activationVariant,
                    activationHandler.InterfacePointer,
                    out activationOperationPointer));

                try
                {
                    _audioClientPointer = activationHandler.WaitForClient(ActivationTimeoutMs);
                }
                finally
                {
                    if (activationOperationPointer != IntPtr.Zero)
                    {
                        Marshal.Release(activationOperationPointer);
                    }
                }
            }
            finally
            {
                Marshal.FreeHGlobal(activationBlobPointer);
                activationHandler.Dispose();
            }

            var requestedFormat = CreateRequestedFormat();
            _requestedFormatPointer = Marshal.AllocCoTaskMem(Marshal.SizeOf(typeof(WAVEFORMATEX)));
            Marshal.StructureToPtr(requestedFormat, _requestedFormatPointer, false);
            _waveFormat = WaveFormatInfo.FromPointer(_requestedFormatPointer, KsdAudioSubtypePcm, KsdAudioSubtypeFloat);
            _channelPeaks = new float[Math.Max(1, _waveFormat.ChannelCount)];

            Marshal.ThrowExceptionForHR(AudioClientNativeMethods.Initialize(
                _audioClientPointer,
                AudioClientShareMode.Shared,
                AudioClientStreamFlags.Loopback | AudioClientStreamFlags.AutoConvertPcm | AudioClientStreamFlags.SrcDefaultQuality,
                RequestedBufferDuration,
                0,
                _requestedFormatPointer,
                IntPtr.Zero));

            var captureClientGuid = AudioCaptureClientGuid;
            Marshal.ThrowExceptionForHR(AudioClientNativeMethods.GetService(_audioClientPointer, ref captureClientGuid, out _captureClientPointer));

            Marshal.ThrowExceptionForHR(AudioClientNativeMethods.Start(_audioClientPointer));
            _started = true;
        }

        private void ReadAvailablePackets()
        {
            while (true)
            {
                uint nextPacketSize;
                Marshal.ThrowExceptionForHR(AudioCaptureClientNativeMethods.GetNextPacketSize(_captureClientPointer, out nextPacketSize));
                if (nextPacketSize == 0)
                {
                    return;
                }

                IntPtr bufferPointer;
                uint frameCount;
                AudioClientBufferFlags bufferFlags;
                long devicePosition;
                long qpcPosition;

                Marshal.ThrowExceptionForHR(AudioCaptureClientNativeMethods.GetBuffer(_captureClientPointer, out bufferPointer, out frameCount, out bufferFlags, out devicePosition, out qpcPosition));

                try
                {
                    ReadPacket(bufferPointer, (int)frameCount, (bufferFlags & AudioClientBufferFlags.Silent) == AudioClientBufferFlags.Silent);
                }
                finally
                {
                    Marshal.ThrowExceptionForHR(AudioCaptureClientNativeMethods.ReleaseBuffer(_captureClientPointer, frameCount));
                }
            }
        }

        private void ReadPacket(IntPtr bufferPointer, int frameCount, bool isSilent)
        {
            if (frameCount <= 0)
            {
                return;
            }

            var packetByteCount = frameCount * _waveFormat.BlockAlign;
            EnsurePacketCapacity(packetByteCount);

            if (!isSilent && packetByteCount > 0)
            {
                Marshal.Copy(bufferPointer, _packetBuffer, 0, packetByteCount);
            }

            for (var frameIndex = 0; frameIndex < frameCount; frameIndex++)
            {
                double monoTotal = 0;
                var frameOffset = frameIndex * _waveFormat.BlockAlign;

                for (var channelIndex = 0; channelIndex < _waveFormat.ChannelCount; channelIndex++)
                {
                    var sampleOffset = frameOffset + (channelIndex * _waveFormat.BytesPerSample);
                    var sample = isSilent ? 0f : ReadNormalizedSample(_packetBuffer, sampleOffset, _waveFormat.SampleFormat);
                    var absolute = Math.Abs(sample);

                    if (absolute > _channelPeaks[channelIndex])
                    {
                        _channelPeaks[channelIndex] = absolute;
                    }

                    monoTotal += sample;
                }

                _monoHistory.Write((float)(monoTotal / Math.Max(1, _waveFormat.ChannelCount)));
            }
        }

        private void EmitCurrentState()
        {
            if (_captureClientPointer == IntPtr.Zero)
            {
                WriteSampleJson("app-audio-spectrum", false, 0f, new[] { 0f, 0f }, _inactiveBands);
                return;
            }

            _monoHistory.CopyLatest(_analysisBuffer);
            AnalyzeSpectrum(_analysisBuffer, _waveFormat.SampleRate, _spectrumBands);

            var peak = 0f;
            for (var channelIndex = 0; channelIndex < _channelPeaks.Length; channelIndex++)
            {
                if (_channelPeaks[channelIndex] > peak)
                {
                    peak = _channelPeaks[channelIndex];
                }
            }

            WriteSampleJson("app-audio-spectrum", true, peak, _channelPeaks, _spectrumBands);
            Array.Clear(_channelPeaks, 0, _channelPeaks.Length);
        }

        private void ResetActiveCapture()
        {
            if (_started && _audioClientPointer != IntPtr.Zero)
            {
                try
                {
                    AudioClientNativeMethods.Stop(_audioClientPointer);
                }
                catch
                {
                }
            }

            _started = false;
            _matchedProcessId = 0;

            if (_requestedFormatPointer != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(_requestedFormatPointer);
                _requestedFormatPointer = IntPtr.Zero;
            }

            if (_captureClientPointer != IntPtr.Zero)
            {
                AudioCaptureClientNativeMethods.Release(_captureClientPointer);
                _captureClientPointer = IntPtr.Zero;
            }

            if (_audioClientPointer != IntPtr.Zero)
            {
                AudioClientNativeMethods.Release(_audioClientPointer);
                _audioClientPointer = IntPtr.Zero;
            }

            _channelPeaks = new[] { 0f, 0f };
            _packetBuffer = new byte[0];
            Array.Clear(_analysisBuffer, 0, _analysisBuffer.Length);
            Array.Clear(_fftReal, 0, _fftReal.Length);
            Array.Clear(_fftImaginary, 0, _fftImaginary.Length);
            Array.Clear(_spectrumBands, 0, _spectrumBands.Length);
            _monoHistory.Clear();
            _spectrumGain = 28f;
        }

        private bool IsTargetMatch(params string[] candidates)
        {
            for (var candidateIndex = 0; candidateIndex < candidates.Length; candidateIndex++)
            {
                var normalizedCandidate = NormalizeMatchToken(candidates[candidateIndex]);
                if (string.IsNullOrEmpty(normalizedCandidate))
                {
                    continue;
                }

                if (!string.IsNullOrEmpty(_targetAppId) && (normalizedCandidate == _targetAppId || normalizedCandidate.Contains(_targetAppId) || _targetAppId.Contains(normalizedCandidate)))
                {
                    return true;
                }

                if (!string.IsNullOrEmpty(_targetAppName) && (normalizedCandidate == _targetAppName || normalizedCandidate.Contains(_targetAppName) || _targetAppName.Contains(normalizedCandidate)))
                {
                    return true;
                }
            }

            return false;
        }

        private static WAVEFORMATEX CreateRequestedFormat()
        {
            const ushort channelCount = 2;
            const uint sampleRate = 48000;
            const ushort bitsPerSample = 16;
            var blockAlign = (ushort)(channelCount * (bitsPerSample / 8));

            return new WAVEFORMATEX
            {
                wFormatTag = 1,
                nChannels = channelCount,
                nSamplesPerSec = sampleRate,
                nAvgBytesPerSec = sampleRate * blockAlign,
                nBlockAlign = blockAlign,
                wBitsPerSample = bitsPerSample,
                cbSize = 0
            };
        }

        private void EnsurePacketCapacity(int packetByteCount)
        {
            if (_packetBuffer.Length < packetByteCount)
            {
                _packetBuffer = new byte[packetByteCount];
            }
        }

        private static float ReadNormalizedSample(byte[] buffer, int offset, WaveSampleFormat sampleFormat)
        {
            switch (sampleFormat)
            {
                case WaveSampleFormat.Float32:
                    return Clamp(BitConverter.ToSingle(buffer, offset), -1f, 1f);
                case WaveSampleFormat.Pcm16:
                    return BitConverter.ToInt16(buffer, offset) / 32768f;
                case WaveSampleFormat.Pcm24:
                    var raw24 = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
                    if ((raw24 & 0x800000) != 0)
                    {
                        raw24 |= unchecked((int)0xFF000000);
                    }
                    return raw24 / 8388608f;
                case WaveSampleFormat.Pcm32:
                    return BitConverter.ToInt32(buffer, offset) / 2147483648f;
                default:
                    return 0f;
            }
        }

        private void AnalyzeSpectrum(float[] samples, int sampleRate, float[] outputBands)
        {
            var sampleCount = samples.Length;
            double rmsTotal = 0;

            for (var sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++)
            {
                var sample = samples[sampleIndex];
                var window = 0.5 - (0.5 * Math.Cos((2.0 * Math.PI * sampleIndex) / (sampleCount - 1)));
                _fftReal[sampleIndex] = sample * window;
                _fftImaginary[sampleIndex] = 0;
                rmsTotal += sample * sample;
            }

            PerformFft(_fftReal, _fftImaginary);

            var nyquist = sampleRate * 0.5;
            var maxBandFrequency = Math.Min(MaxBandFrequency, nyquist * 0.96);
            var rawPeak = 0.0;

            for (var bandIndex = 0; bandIndex < outputBands.Length; bandIndex++)
            {
                var startRatio = (double)bandIndex / outputBands.Length;
                var endRatio = (double)(bandIndex + 1) / outputBands.Length;
                var startFrequency = MinBandFrequency * Math.Pow(maxBandFrequency / MinBandFrequency, startRatio);
                var endFrequency = MinBandFrequency * Math.Pow(maxBandFrequency / MinBandFrequency, endRatio);
                var startBin = Math.Max(1, (int)Math.Floor((startFrequency * sampleCount) / sampleRate));
                var endBin = Math.Min((sampleCount / 2) - 1, Math.Max(startBin + 1, (int)Math.Ceiling((endFrequency * sampleCount) / sampleRate)));

                double bandTotal = 0;
                var binCount = 0;

                for (var binIndex = startBin; binIndex < endBin; binIndex++)
                {
                    var magnitude = Math.Sqrt((_fftReal[binIndex] * _fftReal[binIndex]) + (_fftImaginary[binIndex] * _fftImaginary[binIndex])) / sampleCount;
                    bandTotal += magnitude;
                    binCount++;
                }

                var averageMagnitude = bandTotal / Math.Max(1, binCount);
                var tilt = 1.0 + (((double)bandIndex / outputBands.Length) * 0.7);
                var weightedMagnitude = averageMagnitude * tilt;
                outputBands[bandIndex] = (float)weightedMagnitude;

                if (weightedMagnitude > rawPeak)
                {
                    rawPeak = weightedMagnitude;
                }
            }

            var rms = Math.Sqrt(rmsTotal / sampleCount);
            if (rawPeak > 0)
            {
                var targetGain = 0.82 / rawPeak;
                var rmsBias = Clamp(0.16 / Math.Max(0.018, rms), 0.85f, 3.4f);
                targetGain = Clamp(targetGain * rmsBias, 10f, 220f);
                _spectrumGain += (float)((targetGain - _spectrumGain) * (targetGain > _spectrumGain ? 0.22 : 0.08));
            }

            for (var bandIndex = 0; bandIndex < outputBands.Length; bandIndex++)
            {
                var scaled = outputBands[bandIndex] * _spectrumGain;
                var compressed = Math.Log10(1.0 + (scaled * 18.0)) / Math.Log10(19.0);
                outputBands[bandIndex] = (float)Clamp(compressed < 0.03 ? 0 : compressed, 0, 1);
            }
        }

        private static void PerformFft(double[] real, double[] imaginary)
        {
            var sampleCount = real.Length;
            var bitReversedIndex = 0;

            for (var index = 1; index < sampleCount; index++)
            {
                var bit = sampleCount >> 1;
                while ((bitReversedIndex & bit) != 0)
                {
                    bitReversedIndex ^= bit;
                    bit >>= 1;
                }

                bitReversedIndex ^= bit;

                if (index < bitReversedIndex)
                {
                    Swap(real, index, bitReversedIndex);
                    Swap(imaginary, index, bitReversedIndex);
                }
            }

            for (var segmentLength = 2; segmentLength <= sampleCount; segmentLength <<= 1)
            {
                var angle = (-2.0 * Math.PI) / segmentLength;
                var stepCosine = Math.Cos(angle);
                var stepSine = Math.Sin(angle);

                for (var segmentStart = 0; segmentStart < sampleCount; segmentStart += segmentLength)
                {
                    var twiddleCosine = 1.0;
                    var twiddleSine = 0.0;
                    var halfLength = segmentLength >> 1;

                    for (var offset = 0; offset < halfLength; offset++)
                    {
                        var evenIndex = segmentStart + offset;
                        var oddIndex = evenIndex + halfLength;

                        var tempReal = (real[oddIndex] * twiddleCosine) - (imaginary[oddIndex] * twiddleSine);
                        var tempImaginary = (real[oddIndex] * twiddleSine) + (imaginary[oddIndex] * twiddleCosine);

                        real[oddIndex] = real[evenIndex] - tempReal;
                        imaginary[oddIndex] = imaginary[evenIndex] - tempImaginary;
                        real[evenIndex] += tempReal;
                        imaginary[evenIndex] += tempImaginary;

                        var nextTwiddleCosine = (twiddleCosine * stepCosine) - (twiddleSine * stepSine);
                        twiddleSine = (twiddleCosine * stepSine) + (twiddleSine * stepCosine);
                        twiddleCosine = nextTwiddleCosine;
                    }
                }
            }
        }

        private static void Swap(double[] values, int leftIndex, int rightIndex)
        {
            var value = values[leftIndex];
            values[leftIndex] = values[rightIndex];
            values[rightIndex] = value;
        }

        private static string TryGetProcessName(int processId)
        {
            if (processId <= 0)
            {
                return null;
            }

            try
            {
                return Process.GetProcessById(processId).ProcessName;
            }
            catch
            {
                return null;
            }
        }

        private static void RunHostFallback()
        {
            using (var fallbackCapture = new LoopbackSpectrumCapture())
            {
                fallbackCapture.Run();
            }
        }
    }

    private sealed class LoopbackSpectrumCapture : IAudioCaptureRunner
    {
        private const int EmitIntervalMs = 50;
        private const int AnalysisSampleCount = 4096;
        private const int SpectrumBandCount = 48;
        private const double MinBandFrequency = 18.0;
        private const double MaxBandFrequency = 16000.0;
        private const long RequestedBufferDuration = 10000000L;

        private static readonly Guid AudioClientGuid = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
        private static readonly Guid AudioCaptureClientGuid = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
        private static readonly Guid KsdAudioSubtypePcm = new Guid("00000001-0000-0010-8000-00AA00389B71");
        private static readonly Guid KsdAudioSubtypeFloat = new Guid("00000003-0000-0010-8000-00AA00389B71");

        private readonly SampleRingBuffer _monoHistory = new SampleRingBuffer(AnalysisSampleCount * 2);
        private readonly float[] _analysisBuffer = new float[AnalysisSampleCount];
        private readonly double[] _fftReal = new double[AnalysisSampleCount];
        private readonly double[] _fftImaginary = new double[AnalysisSampleCount];
        private readonly float[] _spectrumBands = new float[SpectrumBandCount];

        private IMMDeviceEnumerator _enumerator;
        private IMMDevice _device;
        private IAudioClient _audioClient;
        private IAudioCaptureClient _captureClient;
        private IntPtr _mixFormatPointer = IntPtr.Zero;
        private WaveFormatInfo _waveFormat;
        private byte[] _packetBuffer = new byte[0];
        private float[] _channelPeaks = new float[0];
        private float _spectrumGain = 28f;
        private bool _started;

        public void Run()
        {
            Initialize();
            Marshal.ThrowExceptionForHR(_audioClient.Start());
            _started = true;

            try
            {
                long nextEmitAt = GetCurrentTimeMilliseconds();

                while (true)
                {
                    ReadAvailablePackets();

                    var now = GetCurrentTimeMilliseconds();
                    if (now >= nextEmitAt)
                    {
                        EmitCurrentState();
                        nextEmitAt = now + EmitIntervalMs;
                    }

                    Thread.Sleep(10);
                }
            }
            finally
            {
                if (_started && _audioClient != null)
                {
                    try
                    {
                        _audioClient.Stop();
                    }
                    catch
                    {
                    }
                }
            }
        }

        public void Dispose()
        {
            if (_mixFormatPointer != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(_mixFormatPointer);
                _mixFormatPointer = IntPtr.Zero;
            }

            ReleaseComObject(_captureClient);
            ReleaseComObject(_audioClient);
            ReleaseComObject(_device);
            ReleaseComObject(_enumerator);
        }

        private void Initialize()
        {
            _enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            Marshal.ThrowExceptionForHR(_enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out _device));

            object audioClientObject;
            var audioClientGuid = AudioClientGuid;
            Marshal.ThrowExceptionForHR(_device.Activate(ref audioClientGuid, CLSCTX.ALL, IntPtr.Zero, out audioClientObject));
            _audioClient = (IAudioClient)audioClientObject;

            Marshal.ThrowExceptionForHR(_audioClient.GetMixFormat(out _mixFormatPointer));
            _waveFormat = WaveFormatInfo.FromPointer(_mixFormatPointer, KsdAudioSubtypePcm, KsdAudioSubtypeFloat);
            _channelPeaks = new float[Math.Max(1, _waveFormat.ChannelCount)];

            Marshal.ThrowExceptionForHR(_audioClient.Initialize(
                AudioClientShareMode.Shared,
                AudioClientStreamFlags.Loopback,
                RequestedBufferDuration,
                0,
                _mixFormatPointer,
                IntPtr.Zero));

            object captureClientObject;
            var captureClientGuid = AudioCaptureClientGuid;
            Marshal.ThrowExceptionForHR(_audioClient.GetService(ref captureClientGuid, out captureClientObject));
            _captureClient = (IAudioCaptureClient)captureClientObject;
        }

        private void ReadAvailablePackets()
        {
            while (true)
            {
                uint nextPacketSize;
                Marshal.ThrowExceptionForHR(_captureClient.GetNextPacketSize(out nextPacketSize));
                if (nextPacketSize == 0)
                {
                    return;
                }

                IntPtr bufferPointer;
                uint frameCount;
                AudioClientBufferFlags bufferFlags;
                long devicePosition;
                long qpcPosition;

                Marshal.ThrowExceptionForHR(_captureClient.GetBuffer(out bufferPointer, out frameCount, out bufferFlags, out devicePosition, out qpcPosition));

                try
                {
                    ReadPacket(bufferPointer, (int)frameCount, (bufferFlags & AudioClientBufferFlags.Silent) == AudioClientBufferFlags.Silent);
                }
                finally
                {
                    Marshal.ThrowExceptionForHR(_captureClient.ReleaseBuffer(frameCount));
                }
            }
        }

        private void ReadPacket(IntPtr bufferPointer, int frameCount, bool isSilent)
        {
            if (frameCount <= 0)
            {
                return;
            }

            var packetByteCount = frameCount * _waveFormat.BlockAlign;
            EnsurePacketCapacity(packetByteCount);

            if (!isSilent && packetByteCount > 0)
            {
                Marshal.Copy(bufferPointer, _packetBuffer, 0, packetByteCount);
            }

            for (var frameIndex = 0; frameIndex < frameCount; frameIndex++)
            {
                double monoTotal = 0;
                var frameOffset = frameIndex * _waveFormat.BlockAlign;

                for (var channelIndex = 0; channelIndex < _waveFormat.ChannelCount; channelIndex++)
                {
                    var sampleOffset = frameOffset + (channelIndex * _waveFormat.BytesPerSample);
                    var sample = isSilent ? 0f : ReadNormalizedSample(_packetBuffer, sampleOffset, _waveFormat.SampleFormat);
                    var absolute = Math.Abs(sample);

                    if (absolute > _channelPeaks[channelIndex])
                    {
                        _channelPeaks[channelIndex] = absolute;
                    }

                    monoTotal += sample;
                }

                _monoHistory.Write((float)(monoTotal / Math.Max(1, _waveFormat.ChannelCount)));
            }
        }

        private void EmitCurrentState()
        {
            _monoHistory.CopyLatest(_analysisBuffer);

            AnalyzeSpectrum(_analysisBuffer, _waveFormat.SampleRate, _spectrumBands);

            var peak = 0f;
            for (var channelIndex = 0; channelIndex < _channelPeaks.Length; channelIndex++)
            {
                if (_channelPeaks[channelIndex] > peak)
                {
                    peak = _channelPeaks[channelIndex];
                }
            }

            Program.WriteSampleJson("host-audio-spectrum", true, peak, _channelPeaks, _spectrumBands);
            Array.Clear(_channelPeaks, 0, _channelPeaks.Length);
        }

        private void EnsurePacketCapacity(int packetByteCount)
        {
            if (_packetBuffer.Length < packetByteCount)
            {
                _packetBuffer = new byte[packetByteCount];
            }
        }

        private static float ReadNormalizedSample(byte[] buffer, int offset, WaveSampleFormat sampleFormat)
        {
            switch (sampleFormat)
            {
                case WaveSampleFormat.Float32:
                    return Clamp(BitConverter.ToSingle(buffer, offset), -1f, 1f);
                case WaveSampleFormat.Pcm16:
                    return BitConverter.ToInt16(buffer, offset) / 32768f;
                case WaveSampleFormat.Pcm24:
                    var raw24 = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
                    if ((raw24 & 0x800000) != 0)
                    {
                        raw24 |= unchecked((int)0xFF000000);
                    }
                    return raw24 / 8388608f;
                case WaveSampleFormat.Pcm32:
                    return BitConverter.ToInt32(buffer, offset) / 2147483648f;
                default:
                    return 0f;
            }
        }

        private void AnalyzeSpectrum(float[] samples, int sampleRate, float[] outputBands)
        {
            var sampleCount = samples.Length;
            double rmsTotal = 0;

            for (var sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++)
            {
                var sample = samples[sampleIndex];
                var window = 0.5 - (0.5 * Math.Cos((2.0 * Math.PI * sampleIndex) / (sampleCount - 1)));
                _fftReal[sampleIndex] = sample * window;
                _fftImaginary[sampleIndex] = 0;
                rmsTotal += sample * sample;
            }

            PerformFft(_fftReal, _fftImaginary);

            var nyquist = sampleRate * 0.5;
            var maxBandFrequency = Math.Min(MaxBandFrequency, nyquist * 0.96);
            var rawPeak = 0.0;

            for (var bandIndex = 0; bandIndex < outputBands.Length; bandIndex++)
            {
                var startRatio = (double)bandIndex / outputBands.Length;
                var endRatio = (double)(bandIndex + 1) / outputBands.Length;
                var startFrequency = MinBandFrequency * Math.Pow(maxBandFrequency / MinBandFrequency, startRatio);
                var endFrequency = MinBandFrequency * Math.Pow(maxBandFrequency / MinBandFrequency, endRatio);
                var startBin = Math.Max(1, (int)Math.Floor((startFrequency * sampleCount) / sampleRate));
                var endBin = Math.Min((sampleCount / 2) - 1, Math.Max(startBin + 1, (int)Math.Ceiling((endFrequency * sampleCount) / sampleRate)));

                double bandTotal = 0;
                var binCount = 0;

                for (var binIndex = startBin; binIndex < endBin; binIndex++)
                {
                    var magnitude = Math.Sqrt((_fftReal[binIndex] * _fftReal[binIndex]) + (_fftImaginary[binIndex] * _fftImaginary[binIndex])) / sampleCount;
                    bandTotal += magnitude;
                    binCount++;
                }

                var averageMagnitude = bandTotal / Math.Max(1, binCount);
                var tilt = 1.0 + (((double)bandIndex / outputBands.Length) * 0.7);
                var weightedMagnitude = averageMagnitude * tilt;
                outputBands[bandIndex] = (float)weightedMagnitude;

                if (weightedMagnitude > rawPeak)
                {
                    rawPeak = weightedMagnitude;
                }
            }

            var rms = Math.Sqrt(rmsTotal / sampleCount);
            if (rawPeak > 0)
            {
                var targetGain = 0.82 / rawPeak;
                var rmsBias = Clamp(0.16 / Math.Max(0.018, rms), 0.85f, 3.4f);
                targetGain = Clamp(targetGain * rmsBias, 10f, 220f);
                _spectrumGain += (float)((targetGain - _spectrumGain) * (targetGain > _spectrumGain ? 0.22 : 0.08));
            }

            for (var bandIndex = 0; bandIndex < outputBands.Length; bandIndex++)
            {
                var scaled = outputBands[bandIndex] * _spectrumGain;
                var compressed = Math.Log10(1.0 + (scaled * 18.0)) / Math.Log10(19.0);
                outputBands[bandIndex] = (float)Clamp(compressed < 0.03 ? 0 : compressed, 0, 1);
            }
        }

        private static void PerformFft(double[] real, double[] imaginary)
        {
            var sampleCount = real.Length;
            var bitReversedIndex = 0;

            for (var index = 1; index < sampleCount; index++)
            {
                var bit = sampleCount >> 1;
                while ((bitReversedIndex & bit) != 0)
                {
                    bitReversedIndex ^= bit;
                    bit >>= 1;
                }

                bitReversedIndex ^= bit;

                if (index < bitReversedIndex)
                {
                    Swap(real, index, bitReversedIndex);
                    Swap(imaginary, index, bitReversedIndex);
                }
            }

            for (var segmentLength = 2; segmentLength <= sampleCount; segmentLength <<= 1)
            {
                var angle = (-2.0 * Math.PI) / segmentLength;
                var stepCosine = Math.Cos(angle);
                var stepSine = Math.Sin(angle);

                for (var segmentStart = 0; segmentStart < sampleCount; segmentStart += segmentLength)
                {
                    var twiddleCosine = 1.0;
                    var twiddleSine = 0.0;
                    var halfLength = segmentLength >> 1;

                    for (var offset = 0; offset < halfLength; offset++)
                    {
                        var evenIndex = segmentStart + offset;
                        var oddIndex = evenIndex + halfLength;

                        var tempReal = (real[oddIndex] * twiddleCosine) - (imaginary[oddIndex] * twiddleSine);
                        var tempImaginary = (real[oddIndex] * twiddleSine) + (imaginary[oddIndex] * twiddleCosine);

                        real[oddIndex] = real[evenIndex] - tempReal;
                        imaginary[oddIndex] = imaginary[evenIndex] - tempImaginary;
                        real[evenIndex] += tempReal;
                        imaginary[evenIndex] += tempImaginary;

                        var nextTwiddleCosine = (twiddleCosine * stepCosine) - (twiddleSine * stepSine);
                        twiddleSine = (twiddleCosine * stepSine) + (twiddleSine * stepCosine);
                        twiddleCosine = nextTwiddleCosine;
                    }
                }
            }
        }

        private static void Swap(double[] values, int leftIndex, int rightIndex)
        {
            var value = values[leftIndex];
            values[leftIndex] = values[rightIndex];
            values[rightIndex] = value;
        }

    }

    private sealed class SampleRingBuffer
    {
        private readonly float[] _samples;
        private int _nextIndex;
        private int _count;

        public SampleRingBuffer(int capacity)
        {
            _samples = new float[Math.Max(1, capacity)];
        }

        public void Write(float sample)
        {
            _samples[_nextIndex] = sample;
            _nextIndex = (_nextIndex + 1) % _samples.Length;

            if (_count < _samples.Length)
            {
                _count++;
            }
        }

        public void CopyLatest(float[] destination)
        {
            Array.Clear(destination, 0, destination.Length);

            var copyCount = Math.Min(destination.Length, _count);
            if (copyCount <= 0)
            {
                return;
            }

            var destinationOffset = destination.Length - copyCount;
            var startIndex = (_nextIndex - copyCount + _samples.Length) % _samples.Length;

            for (var index = 0; index < copyCount; index++)
            {
                destination[destinationOffset + index] = _samples[(startIndex + index) % _samples.Length];
            }
        }

        public void Clear()
        {
            Array.Clear(_samples, 0, _samples.Length);
            _nextIndex = 0;
            _count = 0;
        }
    }

    private sealed class WaveFormatInfo
    {
        public int ChannelCount { get; private set; }
        public int SampleRate { get; private set; }
        public int BlockAlign { get; private set; }
        public int BytesPerSample { get; private set; }
        public WaveSampleFormat SampleFormat { get; private set; }

        public static WaveFormatInfo FromPointer(IntPtr formatPointer, Guid pcmSubtype, Guid floatSubtype)
        {
            var format = (WAVEFORMATEX)Marshal.PtrToStructure(formatPointer, typeof(WAVEFORMATEX));
            var sampleFormat = WaveSampleFormat.Unknown;

            if (format.wFormatTag == 3 && format.wBitsPerSample == 32)
            {
                sampleFormat = WaveSampleFormat.Float32;
            }
            else if (format.wFormatTag == 1)
            {
                sampleFormat = GetPcmSampleFormat(format.wBitsPerSample);
            }
            else if (format.wFormatTag == 65534 && format.cbSize >= 22)
            {
                var extensible = (WAVEFORMATEXTENSIBLE)Marshal.PtrToStructure(formatPointer, typeof(WAVEFORMATEXTENSIBLE));
                if (extensible.SubFormat == floatSubtype && format.wBitsPerSample == 32)
                {
                    sampleFormat = WaveSampleFormat.Float32;
                }
                else if (extensible.SubFormat == pcmSubtype)
                {
                    sampleFormat = GetPcmSampleFormat(format.wBitsPerSample);
                }
            }

            if (sampleFormat == WaveSampleFormat.Unknown)
            {
                throw new NotSupportedException("Unsupported Windows audio mix format for loopback capture.");
            }

            return new WaveFormatInfo
            {
                ChannelCount = Math.Max(1, (int)format.nChannels),
                SampleRate = (int)format.nSamplesPerSec,
                BlockAlign = Math.Max(1, (int)format.nBlockAlign),
                BytesPerSample = Math.Max(1, ((int)format.nBlockAlign) / Math.Max(1, (int)format.nChannels)),
                SampleFormat = sampleFormat
            };
        }

        private static WaveSampleFormat GetPcmSampleFormat(int bitsPerSample)
        {
            switch (bitsPerSample)
            {
                case 16:
                    return WaveSampleFormat.Pcm16;
                case 24:
                    return WaveSampleFormat.Pcm24;
                case 32:
                    return WaveSampleFormat.Pcm32;
                default:
                    return WaveSampleFormat.Unknown;
            }
        }
    }

    private enum WaveSampleFormat
    {
        Unknown,
        Pcm16,
        Pcm24,
        Pcm32,
        Float32
    }

    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorComObject
    {
    }

    private enum EDataFlow
    {
        eRender,
        eCapture,
        eAll,
        EDataFlow_enum_count
    }

    private enum ERole
    {
        eConsole,
        eMultimedia,
        eCommunications,
        ERole_enum_count
    }

    [Flags]
    private enum CLSCTX : uint
    {
        INPROC_SERVER = 0x1,
        INPROC_HANDLER = 0x2,
        LOCAL_SERVER = 0x4,
        REMOTE_SERVER = 0x10,
        ALL = INPROC_SERVER | INPROC_HANDLER | LOCAL_SERVER | REMOTE_SERVER
    }

    private enum AudioClientShareMode
    {
        Shared = 0,
        Exclusive = 1
    }

    [Flags]
    private enum AudioClientStreamFlags
    {
        None = 0x0,
        Loopback = 0x00020000,
        SrcDefaultQuality = 0x08000000,
        AutoConvertPcm = unchecked((int)0x80000000)
    }

    [Flags]
    private enum AudioClientBufferFlags
    {
        None = 0x0,
        DataDiscontinuity = 0x1,
        Silent = 0x2,
        TimestampError = 0x4
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    private struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    private struct WAVEFORMATEXTENSIBLE
    {
        public WAVEFORMATEX Format;
        public ushort Samples;
        public uint ChannelMask;
        public Guid SubFormat;
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        int NotImpl1();
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        int Activate(ref Guid iid, CLSCTX clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    }

    [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioClient
    {
        int Initialize(AudioClientShareMode shareMode, AudioClientStreamFlags streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr audioSessionGuid);
        int GetBufferSize(out uint bufferSize);
        int GetStreamLatency(out long latency);
        int GetCurrentPadding(out uint padding);
        int IsFormatSupported(AudioClientShareMode shareMode, IntPtr format, out IntPtr closestMatch);
        int GetMixFormat(out IntPtr deviceFormat);
        int GetDevicePeriod(out long defaultDevicePeriod, out long minimumDevicePeriod);
        int Start();
        int Stop();
        int Reset();
        int SetEventHandle(IntPtr eventHandle);
        int GetService(ref Guid interfaceId, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    }

    [Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioCaptureClient
    {
        int GetBuffer(out IntPtr data, out uint frameCount, out AudioClientBufferFlags flags, out long devicePosition, out long qpcPosition);
        int ReleaseBuffer(uint frameCount);
        int GetNextPacketSize(out uint packetSize);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        int GetAudioSessionControl(IntPtr audioSessionGuid, int streamFlags, out IntPtr sessionControl);
        int GetSimpleAudioVolume(IntPtr audioSessionGuid, int streamFlags, out IntPtr audioVolume);
        int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnum);
        int RegisterSessionNotification(IntPtr sessionNotification);
        int UnregisterSessionNotification(IntPtr sessionNotification);
        int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr duckNotification);
        int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        int GetCount(out int sessionCount);
        int GetSession(int sessionIndex, out IAudioSessionControl sessionControl);
    }

    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl
    {
        int GetState(out AudioSessionState state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string displayName);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string iconPath);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
        int GetGroupingParam(out Guid groupingId);
        int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
        int RegisterAudioSessionNotification(IntPtr client);
        int UnregisterAudioSessionNotification(IntPtr client);
    }

    [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2
    {
        int GetState(out AudioSessionState state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string displayName);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string iconPath);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
        int GetGroupingParam(out Guid groupingId);
        int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
        int RegisterAudioSessionNotification(IntPtr client);
        int UnregisterAudioSessionNotification(IntPtr client);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
        int GetProcessId(out uint processId);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool enabled);
    }

    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioMeterInformation
    {
        int GetPeakValue(out float peak);
        int GetMeteringChannelCount(out int channelCount);
        int GetChannelsPeakValues(int channelCount, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] float[] peakValues);
        int QueryHardwareSupport(out int hardwareSupportMask);
    }

    private enum AudioSessionState
    {
        Inactive = 0,
        Active = 1,
        Expired = 2
    }

    private enum AudioClientActivationType
    {
        Default = 0,
        ProcessLoopback = 1
    }

    private enum ProcessLoopbackMode
    {
        IncludeTargetProcessTree = 0,
        ExcludeTargetProcessTree = 1
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
    {
        public uint TargetProcessId;
        public ProcessLoopbackMode ProcessLoopbackMode;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AUDIOCLIENT_ACTIVATION_PARAMS
    {
        public AudioClientActivationType ActivationType;
        public AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BLOB
    {
        public int cbSize;
        public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct PROPVARIANT
    {
        [FieldOffset(0)]
        public ushort vt;

        [FieldOffset(8)]
        public BLOB blob;

        public static PROPVARIANT CreateBlob(IntPtr pointer, int size)
        {
            return new PROPVARIANT
            {
                vt = 65,
                blob = new BLOB
                {
                    cbSize = size,
                    pBlobData = pointer
                }
            };
        }
    }

    [ComImport]
    [Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceAsyncOperation
    {
        int GetActivateResult(out int activateResult, out IntPtr activatedInterface);
    }

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int QueryInterfaceDelegate(IntPtr @this, ref Guid iid, out IntPtr interfacePointer);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int AddRefReleaseDelegate(IntPtr @this);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int ActivateCompletedDelegate(IntPtr @this, IntPtr activateOperation);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int AudioClientInitializeDelegate(IntPtr @this, AudioClientShareMode shareMode, AudioClientStreamFlags streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr audioSessionGuid);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int AudioClientGetServiceDelegate(IntPtr @this, ref Guid interfaceId, out IntPtr interfacePointer);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int AudioClientStartStopDelegate(IntPtr @this);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int AudioCaptureClientGetBufferDelegate(IntPtr @this, out IntPtr data, out uint frameCount, out AudioClientBufferFlags flags, out long devicePosition, out long qpcPosition);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int AudioCaptureClientReleaseBufferDelegate(IntPtr @this, uint frameCount);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int AudioCaptureClientGetNextPacketSizeDelegate(IntPtr @this, out uint packetSize);

    private sealed class RawActivateAudioInterfaceCompletionHandler : IDisposable
    {
        private static readonly Guid IUnknownGuid = new Guid("00000000-0000-0000-C000-000000000046");
        private static readonly Guid ActivateHandlerGuid = new Guid("41D949AB-9862-444A-80F6-C261334DA5EB");
        private static readonly Guid AgileObjectGuid = new Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90");

        private static readonly QueryInterfaceDelegate QueryInterfaceImplementation = QueryInterface;
        private static readonly AddRefReleaseDelegate AddRefImplementation = AddRef;
        private static readonly AddRefReleaseDelegate ReleaseImplementation = Release;
        private static readonly ActivateCompletedDelegate ActivateCompletedImplementation = ActivateCompleted;

        private static readonly IntPtr QueryInterfacePointer = Marshal.GetFunctionPointerForDelegate(QueryInterfaceImplementation);
        private static readonly IntPtr AddRefPointer = Marshal.GetFunctionPointerForDelegate(AddRefImplementation);
        private static readonly IntPtr ReleasePointer = Marshal.GetFunctionPointerForDelegate(ReleaseImplementation);
        private static readonly IntPtr ActivateCompletedPointer = Marshal.GetFunctionPointerForDelegate(ActivateCompletedImplementation);
        private static readonly IntPtr VTablePointer = CreateVTable();

        private readonly ManualResetEvent _completed = new ManualResetEvent(false);
        private readonly GCHandle _selfHandle;
        private int _referenceCount;
        private Exception _error;
        private IntPtr _audioClientPointer;

        public RawActivateAudioInterfaceCompletionHandler()
        {
            _referenceCount = 1;
            _selfHandle = GCHandle.Alloc(this, GCHandleType.Normal);
            InterfacePointer = Marshal.AllocHGlobal(IntPtr.Size * 2);
            Marshal.WriteIntPtr(InterfacePointer, 0, VTablePointer);
            Marshal.WriteIntPtr(InterfacePointer, IntPtr.Size, GCHandle.ToIntPtr(_selfHandle));
        }

        public IntPtr InterfacePointer { get; private set; }

        public IntPtr WaitForClient(int timeoutMs)
        {
            if (!_completed.WaitOne(timeoutMs))
            {
                throw new TimeoutException("Timed out while starting process loopback capture.");
            }

            if (_error != null)
            {
                throw _error;
            }

            if (_audioClientPointer == IntPtr.Zero)
            {
                throw new InvalidOperationException("Process loopback activation did not provide an audio client.");
            }

            return _audioClientPointer;
        }

        public void Dispose()
        {
            if (InterfacePointer != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(InterfacePointer);
                InterfacePointer = IntPtr.Zero;
            }

            if (_selfHandle.IsAllocated)
            {
                _selfHandle.Free();
            }

            _completed.Dispose();
        }

        private static IntPtr CreateVTable()
        {
            var vtable = Marshal.AllocHGlobal(IntPtr.Size * 4);
            Marshal.WriteIntPtr(vtable, 0 * IntPtr.Size, QueryInterfacePointer);
            Marshal.WriteIntPtr(vtable, 1 * IntPtr.Size, AddRefPointer);
            Marshal.WriteIntPtr(vtable, 2 * IntPtr.Size, ReleasePointer);
            Marshal.WriteIntPtr(vtable, 3 * IntPtr.Size, ActivateCompletedPointer);
            return vtable;
        }

        private static RawActivateAudioInterfaceCompletionHandler FromPointer(IntPtr @this)
        {
            var handlePointer = Marshal.ReadIntPtr(@this, IntPtr.Size);
            var handle = GCHandle.FromIntPtr(handlePointer);
            return (RawActivateAudioInterfaceCompletionHandler)handle.Target;
        }

        private static int QueryInterface(IntPtr @this, ref Guid iid, out IntPtr interfacePointer)
        {
            if (iid == IUnknownGuid || iid == ActivateHandlerGuid || iid == AgileObjectGuid)
            {
                interfacePointer = @this;
                AddRef(@this);
                return 0;
            }

            interfacePointer = IntPtr.Zero;
            return unchecked((int)0x80004002);
        }

        private static int AddRef(IntPtr @this)
        {
            return Interlocked.Increment(ref FromPointer(@this)._referenceCount);
        }

        private static int Release(IntPtr @this)
        {
            return Interlocked.Decrement(ref FromPointer(@this)._referenceCount);
        }

        private static int ActivateCompleted(IntPtr @this, IntPtr activateOperationPointer)
        {
            var instance = FromPointer(@this);

            try
            {
                var activateOperation = (IActivateAudioInterfaceAsyncOperation)Marshal.GetObjectForIUnknown(activateOperationPointer);
                try
                {
                    int activateResult;
                    IntPtr activatedInterface;
                    Marshal.ThrowExceptionForHR(activateOperation.GetActivateResult(out activateResult, out activatedInterface));
                    Marshal.ThrowExceptionForHR(activateResult);
                    instance._audioClientPointer = activatedInterface;
                }
                finally
                {
                    if (activateOperation != null && Marshal.IsComObject(activateOperation))
                    {
                        Marshal.ReleaseComObject(activateOperation);
                    }
                }
            }
            catch (Exception exception)
            {
                instance._error = exception;
            }
            finally
            {
                instance._completed.Set();
            }

            return 0;
        }
    }

    private static class AudioClientNativeMethods
    {
        public static int Initialize(IntPtr audioClientPointer, AudioClientShareMode shareMode, AudioClientStreamFlags streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr audioSessionGuid)
        {
            var method = GetDelegate<AudioClientInitializeDelegate>(audioClientPointer, 3);
            return method(audioClientPointer, shareMode, streamFlags, bufferDuration, periodicity, format, audioSessionGuid);
        }

        public static int GetService(IntPtr audioClientPointer, ref Guid interfaceId, out IntPtr interfacePointer)
        {
            var method = GetDelegate<AudioClientGetServiceDelegate>(audioClientPointer, 14);
            return method(audioClientPointer, ref interfaceId, out interfacePointer);
        }

        public static int Start(IntPtr audioClientPointer)
        {
            var method = GetDelegate<AudioClientStartStopDelegate>(audioClientPointer, 10);
            return method(audioClientPointer);
        }

        public static int Stop(IntPtr audioClientPointer)
        {
            var method = GetDelegate<AudioClientStartStopDelegate>(audioClientPointer, 11);
            return method(audioClientPointer);
        }

        public static int Release(IntPtr audioClientPointer)
        {
            var method = GetDelegate<AddRefReleaseDelegate>(audioClientPointer, 2);
            return method(audioClientPointer);
        }

        private static T GetDelegate<T>(IntPtr interfacePointer, int methodIndex)
        {
            var vtablePointer = Marshal.ReadIntPtr(interfacePointer);
            var methodPointer = Marshal.ReadIntPtr(vtablePointer, methodIndex * IntPtr.Size);
            return (T)(object)Marshal.GetDelegateForFunctionPointer(methodPointer, typeof(T));
        }
    }

    private static class AudioCaptureClientNativeMethods
    {
        public static int GetBuffer(IntPtr captureClientPointer, out IntPtr data, out uint frameCount, out AudioClientBufferFlags flags, out long devicePosition, out long qpcPosition)
        {
            var method = GetDelegate<AudioCaptureClientGetBufferDelegate>(captureClientPointer, 3);
            return method(captureClientPointer, out data, out frameCount, out flags, out devicePosition, out qpcPosition);
        }

        public static int ReleaseBuffer(IntPtr captureClientPointer, uint frameCount)
        {
            var method = GetDelegate<AudioCaptureClientReleaseBufferDelegate>(captureClientPointer, 4);
            return method(captureClientPointer, frameCount);
        }

        public static int GetNextPacketSize(IntPtr captureClientPointer, out uint packetSize)
        {
            var method = GetDelegate<AudioCaptureClientGetNextPacketSizeDelegate>(captureClientPointer, 5);
            return method(captureClientPointer, out packetSize);
        }

        public static int Release(IntPtr captureClientPointer)
        {
            var method = GetDelegate<AddRefReleaseDelegate>(captureClientPointer, 2);
            return method(captureClientPointer);
        }

        private static T GetDelegate<T>(IntPtr interfacePointer, int methodIndex)
        {
            var vtablePointer = Marshal.ReadIntPtr(interfacePointer);
            var methodPointer = Marshal.ReadIntPtr(vtablePointer, methodIndex * IntPtr.Size);
            return (T)(object)Marshal.GetDelegateForFunctionPointer(methodPointer, typeof(T));
        }
    }

    private const string VirtualAudioDeviceProcessLoopback = "VAD\\Process_Loopback";
}