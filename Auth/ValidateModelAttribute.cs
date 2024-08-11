using Frogmarks.Utilities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Frogmarks.Auth
{
    /// <summary>
    /// Grab the ModelValidation and a custom error object can be returned back to the client
    /// </summary>
    public class ValidateModelAttribute : ActionFilterAttribute
    {
        public override void OnActionExecuting(ActionExecutingContext context)
        {
            if(!context.ModelState.IsValid)
            {
                var fieldName = context.ModelState.Keys.FirstOrDefault();
                var errorMessage = context.ModelState.Values.First().Errors.FirstOrDefault()?.ErrorMessage;
                object obj = context.ActionArguments.Values.FirstOrDefault();
                var result = new ResultModel<object>(ResultType.BadRequest, errorMessage, obj, fieldName);
                context.Result = new BadRequestObjectResult(result);
            }
        }
    }
}
