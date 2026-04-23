using System;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using Windows.Media.Control;
using Windows.Storage.Streams;

internal static class Program
{
    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);

        try
        {
            string targetAppId = args.Length > 0 ? args[0] : null;
            var manager = GlobalSystemMediaTransportControlsSessionManager
                .RequestAsync()
                .AsTask()
                .GetAwaiter()
                .GetResult();

            var session = string.IsNullOrWhiteSpace(targetAppId)
                ? manager.GetCurrentSession()
                : manager.GetSessions().FirstOrDefault(candidate => string.Equals(candidate.SourceAppUserModelId, targetAppId, StringComparison.OrdinalIgnoreCase))
                    ?? manager.GetCurrentSession();

            if (session == null)
            {
                return 2;
            }

            var properties = session
                .TryGetMediaPropertiesAsync()
                .AsTask()
                .GetAwaiter()
                .GetResult();

            if (properties == null || properties.Thumbnail == null)
            {
                return 3;
            }

            using (var stream = properties.Thumbnail.OpenReadAsync().AsTask().GetAwaiter().GetResult())
            {
                if (stream == null || stream.Size == 0)
                {
                    return 4;
                }

                uint size = checked((uint)stream.Size);
                using (IInputStream input = stream.GetInputStreamAt(0))
                using (var reader = new DataReader(input))
                {
                    reader.LoadAsync(size).AsTask().GetAwaiter().GetResult();

                    var bytes = new byte[size];
                    reader.ReadBytes(bytes);

                    Console.Write("{\"contentType\":\"");
                    Console.Write(JsonEscape(string.IsNullOrWhiteSpace(stream.ContentType) ? "image/jpeg" : stream.ContentType));
                    Console.Write("\",\"data\":\"");
                    Console.Write(Convert.ToBase64String(bytes));
                    Console.Write("\"}");
                }
            }

            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.Write(exception.Message);
            return 1;
        }
    }

    private static string JsonEscape(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }
}