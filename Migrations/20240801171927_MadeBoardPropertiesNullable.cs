using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class MadeBoardPropertiesNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_BoardPermissions_PermissionsId",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_BoardUserPreferences_PreferencesId",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamProjects_ProjectId",
                table: "Boards");

            migrationBuilder.DropIndex(
                name: "IX_Boards_PermissionsId",
                table: "Boards");

            migrationBuilder.AlterColumn<long>(
                name: "ProjectId",
                table: "Boards",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint");

            migrationBuilder.AlterColumn<long>(
                name: "PreferencesId",
                table: "Boards",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint");

            migrationBuilder.AlterColumn<long>(
                name: "PermissionsId",
                table: "Boards",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint");

            migrationBuilder.CreateIndex(
                name: "IX_Boards_PermissionsId",
                table: "Boards",
                column: "PermissionsId",
                unique: true,
                filter: "[PermissionsId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_BoardPermissions_PermissionsId",
                table: "Boards",
                column: "PermissionsId",
                principalTable: "BoardPermissions",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_BoardUserPreferences_PreferencesId",
                table: "Boards",
                column: "PreferencesId",
                principalTable: "BoardUserPreferences",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_TeamProjects_ProjectId",
                table: "Boards",
                column: "ProjectId",
                principalTable: "TeamProjects",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_BoardPermissions_PermissionsId",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_BoardUserPreferences_PreferencesId",
                table: "Boards");

            migrationBuilder.DropForeignKey(
                name: "FK_Boards_TeamProjects_ProjectId",
                table: "Boards");

            migrationBuilder.DropIndex(
                name: "IX_Boards_PermissionsId",
                table: "Boards");

            migrationBuilder.AlterColumn<long>(
                name: "ProjectId",
                table: "Boards",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            migrationBuilder.AlterColumn<long>(
                name: "PreferencesId",
                table: "Boards",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            migrationBuilder.AlterColumn<long>(
                name: "PermissionsId",
                table: "Boards",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Boards_PermissionsId",
                table: "Boards",
                column: "PermissionsId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_BoardPermissions_PermissionsId",
                table: "Boards",
                column: "PermissionsId",
                principalTable: "BoardPermissions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_BoardUserPreferences_PreferencesId",
                table: "Boards",
                column: "PreferencesId",
                principalTable: "BoardUserPreferences",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_TeamProjects_ProjectId",
                table: "Boards",
                column: "ProjectId",
                principalTable: "TeamProjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
