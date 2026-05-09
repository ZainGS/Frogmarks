using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class IsPro : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "BlobSizeBytes",
                table: "IllustrationLayers",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "BlobSizeBytes",
                table: "IllustrationCels",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "BlobStorageBytes",
                table: "ApplicationUsers",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<bool>(
                name: "IsPro",
                table: "ApplicationUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BlobSizeBytes",
                table: "IllustrationLayers");

            migrationBuilder.DropColumn(
                name: "BlobSizeBytes",
                table: "IllustrationCels");

            migrationBuilder.DropColumn(
                name: "BlobStorageBytes",
                table: "ApplicationUsers");

            migrationBuilder.DropColumn(
                name: "IsPro",
                table: "ApplicationUsers");
        }
    }
}
