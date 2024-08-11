using Frogmarks.Services.Interfaces;
using Microsoft.IdentityModel.Abstractions;
using Microsoft.ApplicationInsights;
using System.Text.RegularExpressions;
using Microsoft.ApplicationInsights.DataContracts;

namespace Frogmarks.Services
{
    public class ErrorService : IErrorService
    {
        private readonly TelemetryClient _logger;

        public ErrorService(TelemetryClient logger)
        {
            _logger = logger;
        }

        public void LogDebug(string debug)
        {
            _logger.TrackTrace(new TraceTelemetry(debug, SeverityLevel.Verbose));
        }

        public void LogError(Exception exception, string errorTitle = null)
        {
            if(exception.StackTrace != null)
            {
                var traces = GetUserStackTraceLines(exception.StackTrace);
                Dictionary<string, string> properties = new Dictionary<string, string>(); 

                for(int i = 0; i < traces.Count; i++)
                {
                    properties.Add($"{i}", traces[i]);
                }
                properties.Add("ErrorTitle", errorTitle);
                _logger.TrackException(exception, properties);
            }
            else
            {
                _logger.TrackException(exception);
            }
        }

        public void LogError(string error)
        {
            _logger.TrackTrace(error, SeverityLevel.Error);
        }

        public void LogInformation(string information)
        {
            _logger.TrackTrace(information, SeverityLevel.Information);
        }

        public void LogWarning(string warning)
        {
            _logger.TrackTrace(warning, SeverityLevel.Warning);
        }

        private List<string> GetUserStackTraceLines(string fullStackTrace)
        {
            List<string> outputList = new List<string>();
            Regex regex = new Regex(@"([^\)]*\)) in (.*):line (\d)*$");

            List<string> stackTraceLines = GetUserStackTraceLines(fullStackTrace);
            foreach (string stackTraceLine in stackTraceLines)
            {
                if(!regex.IsMatch(stackTraceLine))
                {
                    continue;
                }
                outputList.Add(stackTraceLine);
            }

            return outputList;
        }

        /// <sumary>
        /// Gets a list of stack frame lines as strings.
        /// </sumary>
        /// <param name="stackTrace">Stack trace string.</param>
        private List<string> GetStackTraceLines(string stackTrace)
        {
            return stackTrace.Split(new[] { Environment.NewLine }, StringSplitOptions.None).ToList();
        }
    }
}
