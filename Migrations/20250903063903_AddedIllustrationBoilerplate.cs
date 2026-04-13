using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class AddedIllustrationBoilerplate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "IllustrationPermissions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IllustrationId = table.Column<long>(type: "bigint", nullable: false),
                    CanNonCollaboratorsView = table.Column<bool>(type: "bit", nullable: false),
                    CanNonCollaboratorsEdit = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IllustrationPermissions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IllustrationUserPreferences",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IllustrationdId = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IllustrationUserPreferences", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Illustrations",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UUID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ThumbnailUrl = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsCustomThumbnail = table.Column<bool>(type: "bit", nullable: false),
                    TeamId = table.Column<long>(type: "bigint", nullable: true),
                    isDraft = table.Column<bool>(type: "bit", nullable: false),
                    PreferencesId = table.Column<long>(type: "bigint", nullable: true),
                    ProjectId = table.Column<long>(type: "bigint", nullable: true),
                    PermissionsId = table.Column<long>(type: "bigint", nullable: true),
                    CanvasData = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    Width = table.Column<double>(type: "float", nullable: false),
                    Height = table.Column<double>(type: "float", nullable: false),
                    TeamUserId = table.Column<long>(type: "bigint", nullable: true),
                    DateModified = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ModifiedById = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    Created = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    UpdatedIp = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: true),
                    CreatedIp = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: true),
                    CreatedById = table.Column<string>(type: "nvarchar(450)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Illustrations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Illustrations_ApplicationUsers_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "ApplicationUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Illustrations_ApplicationUsers_ModifiedById",
                        column: x => x.ModifiedById,
                        principalTable: "ApplicationUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Illustrations_IllustrationPermissions_PermissionsId",
                        column: x => x.PermissionsId,
                        principalTable: "IllustrationPermissions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Illustrations_IllustrationUserPreferences_PreferencesId",
                        column: x => x.PreferencesId,
                        principalTable: "IllustrationUserPreferences",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Illustrations_TeamProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "TeamProjects",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Illustrations_TeamUsers_TeamUserId",
                        column: x => x.TeamUserId,
                        principalTable: "TeamUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Illustrations_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "IllustrationCollaborators",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IllustrationId = table.Column<long>(type: "bigint", nullable: true),
                    TeamUserId = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IllustrationCollaborators", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IllustrationCollaborators_Illustrations_IllustrationId",
                        column: x => x.IllustrationId,
                        principalTable: "Illustrations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_IllustrationCollaborators_TeamUsers_TeamUserId",
                        column: x => x.TeamUserId,
                        principalTable: "TeamUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IllustrationViewLogs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IllustrationId = table.Column<long>(type: "bigint", nullable: false),
                    TeamUserId = table.Column<long>(type: "bigint", nullable: false),
                    ApplicationUserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    LastViewed = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IllustrationViewLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IllustrationViewLogs_ApplicationUsers_ApplicationUserId",
                        column: x => x.ApplicationUserId,
                        principalTable: "ApplicationUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IllustrationViewLogs_Illustrations_IllustrationId",
                        column: x => x.IllustrationId,
                        principalTable: "Illustrations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IllustrationViewLogs_TeamUsers_TeamUserId",
                        column: x => x.TeamUserId,
                        principalTable: "TeamUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IllustrationRole",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IllustrationCollaboratorId = table.Column<long>(type: "bigint", nullable: true),
                    RoleName = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IllustrationRole", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IllustrationRole_IllustrationCollaborators_IllustrationCollaboratorId",
                        column: x => x.IllustrationCollaboratorId,
                        principalTable: "IllustrationCollaborators",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationCollaborators_IllustrationId",
                table: "IllustrationCollaborators",
                column: "IllustrationId");

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationCollaborators_TeamUserId",
                table: "IllustrationCollaborators",
                column: "TeamUserId");

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationRole_IllustrationCollaboratorId",
                table: "IllustrationRole",
                column: "IllustrationCollaboratorId");

            migrationBuilder.CreateIndex(
                name: "IX_Illustrations_CreatedById",
                table: "Illustrations",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_Illustrations_ModifiedById",
                table: "Illustrations",
                column: "ModifiedById");

            migrationBuilder.CreateIndex(
                name: "IX_Illustrations_PermissionsId",
                table: "Illustrations",
                column: "PermissionsId",
                unique: true,
                filter: "[PermissionsId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Illustrations_PreferencesId",
                table: "Illustrations",
                column: "PreferencesId");

            migrationBuilder.CreateIndex(
                name: "IX_Illustrations_ProjectId",
                table: "Illustrations",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Illustrations_TeamId",
                table: "Illustrations",
                column: "TeamId");

            migrationBuilder.CreateIndex(
                name: "IX_Illustrations_TeamUserId",
                table: "Illustrations",
                column: "TeamUserId");

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationViewLogs_ApplicationUserId",
                table: "IllustrationViewLogs",
                column: "ApplicationUserId");

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationViewLogs_IllustrationId",
                table: "IllustrationViewLogs",
                column: "IllustrationId");

            migrationBuilder.CreateIndex(
                name: "IX_IllustrationViewLogs_TeamUserId",
                table: "IllustrationViewLogs",
                column: "TeamUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IllustrationRole");

            migrationBuilder.DropTable(
                name: "IllustrationViewLogs");

            migrationBuilder.DropTable(
                name: "IllustrationCollaborators");

            migrationBuilder.DropTable(
                name: "Illustrations");

            migrationBuilder.DropTable(
                name: "IllustrationPermissions");

            migrationBuilder.DropTable(
                name: "IllustrationUserPreferences");
        }
    }
}
