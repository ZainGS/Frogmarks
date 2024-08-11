using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class AddedAuditLogToBoard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamUsers_TeamUserId",
                table: "Boards");

            migrationBuilder.RenameColumn(
                name: "TeamUserId",
                table: "Boards",
                newName: "CreatedById");

            migrationBuilder.RenameIndex(
                name: "IX_Boards_TeamUserId",
                table: "Boards",
                newName: "IX_Boards_CreatedById");

            migrationBuilder.AddColumn<DateTime>(
                name: "Created",
                table: "Boards",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreatedIp",
                table: "Boards",
                type: "nvarchar(250)",
                maxLength: 250,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DateModified",
                table: "Boards",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModifiedById",
                table: "Boards",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedIp",
                table: "Boards",
                type: "nvarchar(250)",
                maxLength: 250,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Boards_ModifiedById",
                table: "Boards",
                column: "ModifiedById");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_ApplicationUsers_ModifiedById",
                table: "Boards",
                column: "ModifiedById",
                principalTable: "ApplicationUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_TeamUsers_CreatedById",
                table: "Boards",
                column: "CreatedById",
                principalTable: "TeamUsers",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_ApplicationUsers_ModifiedById",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamUsers_CreatedById",
                table: "Boards");

            migrationBuilder.DropIndex(
                name: "IX_Boards_ModifiedById",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "Created",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "CreatedIp",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "DateModified",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "ModifiedById",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "UpdatedIp",
                table: "Boards");

            migrationBuilder.RenameColumn(
                name: "CreatedById",
                table: "Boards",
                newName: "TeamUserId");

            migrationBuilder.RenameIndex(
                name: "IX_Boards_CreatedById",
                table: "Boards",
                newName: "IX_Boards_TeamUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_TeamUsers_TeamUserId",
                table: "Boards",
                column: "TeamUserId",
                principalTable: "TeamUsers",
                principalColumn: "Id");
        }
    }
}
