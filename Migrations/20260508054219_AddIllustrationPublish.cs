using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class AddIllustrationPublish : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "Illustrations",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "PublishedAt",
                table: "Illustrations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedBundleBlobName",
                table: "Illustrations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedThumbnailBlobName",
                table: "Illustrations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedTitle",
                table: "Illustrations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PublishedVersion",
                table: "Illustrations",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "PublishedAt",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "PublishedBundleBlobName",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "PublishedThumbnailBlobName",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "PublishedTitle",
                table: "Illustrations");

            migrationBuilder.DropColumn(
                name: "PublishedVersion",
                table: "Illustrations");
        }
    }
}
