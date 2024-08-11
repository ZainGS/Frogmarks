namespace Frogmarks.Utilities
{
    public class ResultModel<T> where T : class
    {
        public ResultModel(ResultType resultType)
        {
            ResultType = resultType;
        }

        public ResultModel(ResultType resultType, string message = null, T resultObject = null, string fieldName = null)
        {
            ResultType = resultType;
            ExtendedMessage = message;
            ResultObject = resultObject;
            FieldName = fieldName;
        }

        public ResultType ResultType { get; set; }
        public string FieldName { get; set; }
        public string ExtendedMessage { get; set; }
        public T ResultObject { get; set; }
    }

    public enum ResultType
    {
        Success = 0,
        Failure = 1,
        NotFound = 2,
        AlreadyExist = 3,
        Unauthorized = 4,
        BadRequest = 5
    }
}