using Frogmarks.Models.Base;
using Frogmarks.Models.Logging;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Board
{
    public class BoardPermissions : Permissions
    {
        public long BoardId { get; set; }
        public virtual Board? Board { get; set; }
    }
}
