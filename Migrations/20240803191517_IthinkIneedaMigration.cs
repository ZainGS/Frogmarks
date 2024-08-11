using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class IthinkIneedaMigration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "Created",
                table: "Teams",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreatedById",
                table: "Teams",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreatedIp",
                table: "Teams",
                type: "nvarchar(250)",
                maxLength: 250,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DateModified",
                table: "Teams",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModifiedById",
                table: "Teams",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedIp",
                table: "Teams",
                type: "nvarchar(250)",
                maxLength: 250,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Teams_CreatedById",
                table: "Teams",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_Teams_ModifiedById",
                table: "Teams",
                column: "ModifiedById");

            migrationBuilder.AddForeignKey(
                name: "FK_Teams_ApplicationUsers_CreatedById",
                table: "Teams",
                column: "CreatedById",
                principalTable: "ApplicationUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Teams_ApplicationUsers_ModifiedById",
                table: "Teams",
                column: "ModifiedById",
                principalTable: "ApplicationUsers",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Teams_ApplicationUsers_CreatedById",
                table: "Teams");

            migrationBuilder.DropForeignKey(
                name: "FK_Teams_ApplicationUsers_ModifiedById",
                table: "Teams");

            migrationBuilder.DropIndex(
                name: "IX_Teams_CreatedById",
                table: "Teams");

            migrationBuilder.DropIndex(
                name: "IX_Teams_ModifiedById",
                table: "Teams");

            migrationBuilder.DropColumn(
                name: "Created",
                table: "Teams");

            migrationBuilder.DropColumn(
                name: "CreatedById",
                table: "Teams");

            migrationBuilder.DropColumn(
                name: "CreatedIp",
                table: "Teams");

            migrationBuilder.DropColumn(
                name: "DateModified",
                table: "Teams");

            migrationBuilder.DropColumn(
                name: "ModifiedById",
                table: "Teams");

            migrationBuilder.DropColumn(
                name: "UpdatedIp",
                table: "Teams");
        }
    }
}
