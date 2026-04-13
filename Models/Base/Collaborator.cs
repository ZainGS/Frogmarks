namespace Frogmarks.Models.Base
{
    public class Collaborator
    {
        public long Id { get; set; }
        public long TeamUserId { get; set; }
        public virtual TeamUser? TeamUser { get; set; }
    }
}
