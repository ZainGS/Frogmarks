using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class DBFixes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_ApplicationUsers_CreatedById",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_ApplicationUsers_ModifiedById",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamUsers_TeamUserId",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_BoardsCollaborators_TeamUsers_UserId",
                table: "BoardsCollaborators");

            migrationBuilder.DropForeignKey(
                name: "FK_TeamUsers_ApplicationUsers_ApplicationUserId",
                table: "TeamUsers");

            migrationBuilder.DropIndex(
                name: "IX_Boards_TeamUserId",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "TeamUserId",
                table: "Boards");

            migrationBuilder.RenameColumn(
                name: "UserId",
                table: "BoardsCollaborators",
                newName: "TeamUserId");

            migrationBuilder.RenameIndex(
                name: "IX_BoardsCollaborators_UserId",
                table: "BoardsCollaborators",
                newName: "IX_BoardsCollaborators_TeamUserId");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Teams",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<long>(
                name: "ModifiedById",
                table: "Boards",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);

            migrationBuilder.AlterColumn<long>(
                name: "CreatedById",
                table: "Boards",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "BoardViewLogs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BoardId = table.Column<long>(type: "bigint", nullable: false),
                    TeamUserId = table.Column<long>(type: "bigint", nullable: false),
                    ApplicationUserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    LastViewed = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardViewLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardViewLogs_ApplicationUsers_ApplicationUserId",
                        column: x => x.ApplicationUserId,
                        principalTable: "ApplicationUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BoardViewLogs_Boards_BoardId",
                        column: x => x.BoardId,
                        principalTable: "Boards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BoardViewLogs_TeamUsers_TeamUserId",
                        column: x => x.TeamUserId,
                        principalTable: "TeamUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoardViewLogs_ApplicationUserId",
                table: "BoardViewLogs",
                column: "ApplicationUserId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardViewLogs_BoardId",
                table: "BoardViewLogs",
                column: "BoardId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardViewLogs_TeamUserId",
                table: "BoardViewLogs",
                column: "TeamUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_TeamUsers_CreatedById",
                table: "Boards",
                column: "CreatedById",
                principalTable: "TeamUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_TeamUsers_ModifiedById",
                table: "Boards",
                column: "ModifiedById",
                principalTable: "TeamUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_BoardsCollaborators_TeamUsers_TeamUserId",
                table: "BoardsCollaborators",
                column: "TeamUserId",
                principalTable: "TeamUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TeamUsers_ApplicationUsers_ApplicationUserId",
                table: "TeamUsers",
                column: "ApplicationUserId",
                principalTable: "ApplicationUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamUsers_CreatedById",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamUsers_ModifiedById",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_BoardsCollaborators_TeamUsers_TeamUserId",
                table: "BoardsCollaborators");

            migrationBuilder.DropForeignKey(
                name: "FK_TeamUsers_ApplicationUsers_ApplicationUserId",
                table: "TeamUsers");

            migrationBuilder.DropTable(
                name: "BoardViewLogs");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Teams");

            migrationBuilder.RenameColumn(
                name: "TeamUserId",
                table: "BoardsCollaborators",
                newName: "UserId");

            migrationBuilder.RenameIndex(
                name: "IX_BoardsCollaborators_TeamUserId",
                table: "BoardsCollaborators",
                newName: "IX_BoardsCollaborators_UserId");

            migrationBuilder.AlterColumn<string>(
                name: "ModifiedById",
                table: "Boards",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CreatedById",
                table: "Boards",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            migrationBuilder.AddColumn<long>(
                name: "TeamUserId",
                table: "Boards",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Boards_TeamUserId",
                table: "Boards",
                column: "TeamUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_ApplicationUsers_CreatedById",
                table: "Boards",
                column: "CreatedById",
                principalTable: "ApplicationUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_ApplicationUsers_ModifiedById",
                table: "Boards",
                column: "ModifiedById",
                principalTable: "ApplicationUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_TeamUsers_TeamUserId",
                table: "Boards",
                column: "TeamUserId",
                principalTable: "TeamUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_BoardsCollaborators_TeamUsers_UserId",
                table: "BoardsCollaborators",
                column: "UserId",
                principalTable: "TeamUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_TeamUsers_ApplicationUsers_ApplicationUserId",
                table: "TeamUsers",
                column: "ApplicationUserId",
                principalTable: "ApplicationUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
