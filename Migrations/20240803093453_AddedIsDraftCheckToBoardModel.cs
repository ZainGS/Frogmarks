using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class AddedIsDraftCheckToBoardModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "isDraft",
                table: "Boards",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "isDraft",
                table: "Boards");
        }
    }
}
