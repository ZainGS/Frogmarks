using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class AddIllustrationExtendedState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Illustration: savedAt timestamp + extended JSON blob (3D, dither, canvas settings)
            migrationBuilder.AddColumn<long>(
                name: "SavedAt",
                table: "Illustrations",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "ExtendedStateJson",
                table: "Illustrations",
                type: "nvarchar(max)",
                nullable: true);

            // Layer: per-layer dither config + frame link animation
            migrationBuilder.AddColumn<string>(
                name: "DitherConfigJson",
                table: "IllustrationLayers",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FrameLinkAnimationJson",
                table: "IllustrationLayers",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "SavedAt", table: "Illustrations");
            migrationBuilder.DropColumn(name: "ExtendedStateJson", table: "Illustrations");
            migrationBuilder.DropColumn(name: "DitherConfigJson", table: "IllustrationLayers");
            migrationBuilder.DropColumn(name: "FrameLinkAnimationJson", table: "IllustrationLayers");
        }
    }
}
