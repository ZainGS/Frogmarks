using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class BoardChangesToTeamFromTeams : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BoardTeam");

            migrationBuilder.AddColumn<long>(
                name: "TeamId",
                table: "Boards",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Boards_TeamId",
                table: "Boards",
                column: "TeamId");

            migrationBuilder.AddForeignKey(
                name: "FK_Boards_Teams_TeamId",
                table: "Boards",
                column: "TeamId",
                principalTable: "Teams",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Boards_Teams_TeamId",
                table: "Boards");

            migrationBuilder.DropIndex(
                name: "IX_Boards_TeamId",
                table: "Boards");

            migrationBuilder.DropColumn(
                name: "TeamId",
                table: "Boards");

            migrationBuilder.CreateTable(
                name: "BoardTeam",
                columns: table => new
                {
                    BoardsId = table.Column<long>(type: "bigint", nullable: false),
                    TeamsId = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardTeam", x => new { x.BoardsId, x.TeamsId });
                    table.ForeignKey(
                        name: "FK_BoardTeam_Boards_BoardsId",
                        column: x => x.BoardsId,
                        principalTable: "Boards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BoardTeam_Teams_TeamsId",
                        column: x => x.TeamsId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoardTeam_TeamsId",
                table: "BoardTeam",
                column: "TeamsId");
        }
    }
}
