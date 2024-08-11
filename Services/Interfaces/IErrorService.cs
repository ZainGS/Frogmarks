namespace Frogmarks.Services.Interfaces
{
    public interface IErrorService
    {
        void LogError(Exception exception, string errorTitle = null);
        void LogError(string error);
        void LogInformation(string information);
        void LogWarning(string warning);
        void LogDebug(string debug);
    }
}
