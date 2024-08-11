namespace Frogmarks.Models.Auth
{
    public class EmailToken : BaseEntity
    {
        public string? Email { get; set; }
        public string? Token { get; set; }
        public DateTime Expiration { get; set; }

    }
}
