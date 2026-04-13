using Frogmarks.Models.Base;

namespace Frogmarks.Models.Illustration
{
    public class IllustrationPermissions : Permissions
    {
        public long IllustrationId { get; set; }
        public virtual Illustration? Illustration { get; set; }
    }
}
