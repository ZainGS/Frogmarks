using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class TheCircleOfGuidAndLong : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamUsers_CreatedById",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamUsers_ModifiedById",
                table: "Boards");

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
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

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
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
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

            migrationBuilder.DropIndex(
                name: "IX_Boards_TeamUserId",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "TeamUserId",
                table: "Boards");

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
        }
    }
}
