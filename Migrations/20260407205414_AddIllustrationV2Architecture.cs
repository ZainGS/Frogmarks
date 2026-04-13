using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class AddIllustrationV2Architecture : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AnimationEnabled",
                table: "Illustrations",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Fps",
                table: "Illustrations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "FrameCount",
                table: "Illustrations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "LoopMode",
                table: "Illustrations",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OnionSkinConfig",
                table: "Illustrations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PlayRangeEnd",
                table: "Illustrations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "PlayRangeStart",
                table: "Illustrations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SceneVersion",
                table: "Illustrations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "IllustrationLayers",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IllustrationId = table.Column<long>(type: "bigint", nullable: false),
                    LayerId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    Visible = table.Column<bool>(type: "bit", nullable: false),
                    Locked = table.Column<bool>(type: "bit", nullable: false),
                    BlendMode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Opacity = table.Column<double>(type: "float", nullable: false),
                    Clipped = table.Column<bool>(type: "bit", nullable: false),
                    LockTransparency = table.Column<bool>(type: "bit", nullable: false),
                    Animated = table.Column<bool>(type: "bit", nullable: false),
                    PixelDataUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    PixelWidth = table.Column<int>(type: "int", nullable: true),
                    PixelHeight = table.Column<int>(type: "int", nullable: true),
                    PixelFormat = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IllustrationLayers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IllustrationLayers_Illustrations_IllustrationId",
                        column: x => x.IllustrationId,
                        principalTable: "Illustrations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IllustrationCels",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LayerDbId = table.Column<long>(type: "bigint", nullable: false),
                    CelId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Frame = table.Column<int>(type: "int", nullable: false),
                    Duration = table.Column<int>(type: "int", nullable: false),
                    IsKey = table.Column<bool>(type: "bit", nullable: false),
                    CelType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    PixelDataUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    PixelWidth = table.Column<int>(type: "int", nullable: true),
                    PixelHeight = table.Column<int>(type: "int", nullable: true),
                    PixelFormat = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    ContentHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IllustrationCels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IllustrationCels_IllustrationLayers_LayerDbId",
                        column: x => x.LayerDbId,
                        principalTable: "IllustrationLayers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationCels_LayerDbId_CelId",
                table: "IllustrationCels",
                columns: new[] { "LayerDbId", "CelId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationLayers_IllustrationId_LayerId",
                table: "IllustrationLayers",
                columns: new[] { "IllustrationId", "LayerId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IllustrationCels");

            migrationBuilder.DropTable(
                name: "IllustrationLayers");

            migrationBuilder.DropColumn(
                name: "AnimationEnabled",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "Fps",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "FrameCount",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "LoopMode",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "OnionSkinConfig",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "PlayRangeEnd",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "PlayRangeStart",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "SceneVersion",
                table: "Illustrations");
        }
    }
}
