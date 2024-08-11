using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class FirstMigration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BoardItemOptions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FontId = table.Column<int>(type: "int", nullable: true),
                    FontSize = table.Column<int>(type: "int", nullable: true),
                    BorderThickness = table.Column<int>(type: "int", nullable: true),
                    BorderOpacity = table.Column<double>(type: "float", nullable: true),
                    BorderColor = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    HorizontalAlignment = table.Column<int>(type: "int", nullable: false),
                    VerticalAlignment = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardItemOptions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BoardItemType",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    HasFont = table.Column<bool>(type: "bit", nullable: false),
                    HasFontSize = table.Column<bool>(type: "bit", nullable: false),
                    HasFontStyle = table.Column<bool>(type: "bit", nullable: false),
                    HasTextAlignment = table.Column<bool>(type: "bit", nullable: false),
                    HasBorderOptions = table.Column<bool>(type: "bit", nullable: false),
                    HasFillColor = table.Column<bool>(type: "bit", nullable: false),
                    HasLink = table.Column<bool>(type: "bit", nullable: false),
                    HasTextColor = table.Column<bool>(type: "bit", nullable: false),
                    HasHighlightColor = table.Column<bool>(type: "bit", nullable: false),
                    HasLock = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardItemType", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BoardPermissions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BoardId = table.Column<long>(type: "bigint", nullable: false),
                    CanNonCollaboratorsView = table.Column<bool>(type: "bit", nullable: false),
                    CanNonCollaboratorsEdit = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardPermissions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BoardUserPreferences",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BoardId = table.Column<long>(type: "bigint", nullable: false),
                    SnapToGrid = table.Column<bool>(type: "bit", nullable: false),
                    ShowCollaboratorCursors = table.Column<bool>(type: "bit", nullable: false),
                    ShowCommentsOnBoard = table.Column<bool>(type: "bit", nullable: false),
                    ShowScrollBars = table.Column<bool>(type: "bit", nullable: false),
                    ShowObjectDimensions = table.Column<bool>(type: "bit", nullable: false),
                    PeripheralType = table.Column<int>(type: "int", nullable: false),
                    AlignObjects = table.Column<bool>(type: "bit", nullable: false),
                    ReduceMotion = table.Column<bool>(type: "bit", nullable: false),
                    FollowAllThreads = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardUserPreferences", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DeviceFlowCodes",
                columns: table => new
                {
                    UserCode = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    DeviceCode = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SubjectId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SessionId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ClientId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Expiration = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Data = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceFlowCodes", x => x.UserCode);
                });

            migrationBuilder.CreateTable(
                name: "EmailTokens",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Token = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Expiration = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailTokens", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Keys",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Created = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Use = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Algorithm = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsX509Certificate = table.Column<bool>(type: "bit", nullable: false),
                    DataProtected = table.Column<bool>(type: "bit", nullable: false),
                    Data = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Keys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PersistedGrants",
                columns: table => new
                {
                    Key = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SubjectId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SessionId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ClientId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Expiration = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ConsumedTime = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Data = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersistedGrants", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "Teams",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Teams", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TeamProjects",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsPublic = table.Column<bool>(type: "bit", nullable: false),
                    TeamId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamProjects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamProjects_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ApplicationUsers",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    FirstName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AzureUserIdentifier = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RefreshToken = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RefreshTokenExpiryTime = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TeamProjectId = table.Column<long>(type: "bigint", nullable: true),
                    UserName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NormalizedUserName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NormalizedEmail = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    EmailConfirmed = table.Column<bool>(type: "bit", nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SecurityStamp = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PhoneNumber = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PhoneNumberConfirmed = table.Column<bool>(type: "bit", nullable: false),
                    TwoFactorEnabled = table.Column<bool>(type: "bit", nullable: false),
                    LockoutEnd = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LockoutEnabled = table.Column<bool>(type: "bit", nullable: false),
                    AccessFailedCount = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApplicationUsers_TeamProjects_TeamProjectId",
                        column: x => x.TeamProjectId,
                        principalTable: "TeamProjects",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TeamUsers",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TeamId = table.Column<long>(type: "bigint", nullable: false),
                    ApplicationUserId = table.Column<string>(type: "nvarchar(450)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamUsers_ApplicationUsers_ApplicationUserId",
                        column: x => x.ApplicationUserId,
                        principalTable: "ApplicationUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TeamUsers_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Boards",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ThumbnailUrl = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    StartViewLeftTop = table.Column<int>(type: "int", nullable: false),
                    StartViewLeftBottom = table.Column<int>(type: "int", nullable: false),
                    StartViewRightTop = table.Column<int>(type: "int", nullable: false),
                    StartViewRightBottom = table.Column<int>(type: "int", nullable: false),
                    BackgroundColor = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PreferencesId = table.Column<long>(type: "bigint", nullable: false),
                    ProjectId = table.Column<long>(type: "bigint", nullable: false),
                    PermissionsId = table.Column<long>(type: "bigint", nullable: false),
                    TeamUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Boards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Boards_BoardPermissions_PermissionsId",
                        column: x => x.PermissionsId,
                        principalTable: "BoardPermissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Boards_BoardUserPreferences_PreferencesId",
                        column: x => x.PreferencesId,
                        principalTable: "BoardUserPreferences",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Boards_TeamProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "TeamProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Boards_TeamUsers_TeamUserId",
                        column: x => x.TeamUserId,
                        principalTable: "TeamUsers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TeamRole",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TeamId = table.Column<long>(type: "bigint", nullable: false),
                    PermissionsId = table.Column<long>(type: "bigint", nullable: false),
                    TeamUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamRole", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamRole_TeamUsers_TeamUserId",
                        column: x => x.TeamUserId,
                        principalTable: "TeamUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TeamRole_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BoardItems",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PositionDataId = table.Column<long>(type: "bigint", nullable: false),
                    TypeId = table.Column<long>(type: "bigint", nullable: false),
                    OptionsId = table.Column<long>(type: "bigint", nullable: false),
                    BoardId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardItems_BoardItemOptions_OptionsId",
                        column: x => x.OptionsId,
                        principalTable: "BoardItemOptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BoardItems_BoardItemType_TypeId",
                        column: x => x.TypeId,
                        principalTable: "BoardItemType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BoardItems_Boards_BoardId",
                        column: x => x.BoardId,
                        principalTable: "Boards",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BoardsCollaborators",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    BoardId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardsCollaborators", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardsCollaborators_Boards_BoardId",
                        column: x => x.BoardId,
                        principalTable: "Boards",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_BoardsCollaborators_TeamUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "TeamUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

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

            migrationBuilder.CreateTable(
                name: "TeamPermissions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TeamRoleId = table.Column<long>(type: "bigint", nullable: false),
                    CanAddMembers = table.Column<bool>(type: "bit", nullable: false),
                    CanDeleteMembers = table.Column<bool>(type: "bit", nullable: false),
                    CanCreateBoards = table.Column<bool>(type: "bit", nullable: false),
                    CanEditBoards = table.Column<bool>(type: "bit", nullable: false),
                    CanDeleteBoards = table.Column<bool>(type: "bit", nullable: false),
                    CanCreateProjects = table.Column<bool>(type: "bit", nullable: false),
                    CanEditProjects = table.Column<bool>(type: "bit", nullable: false),
                    CanDeleteProjects = table.Column<bool>(type: "bit", nullable: false),
                    CanChangePermissions = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamPermissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamPermissions_TeamRole_TeamRoleId",
                        column: x => x.TeamRoleId,
                        principalTable: "TeamRole",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BoardItemPosition",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BoardItemId = table.Column<long>(type: "bigint", nullable: false),
                    X = table.Column<int>(type: "int", nullable: false),
                    Y = table.Column<int>(type: "int", nullable: false),
                    Width = table.Column<int>(type: "int", nullable: false),
                    Height = table.Column<int>(type: "int", nullable: false),
                    Rotation = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardItemPosition", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardItemPosition_BoardItems_BoardItemId",
                        column: x => x.BoardItemId,
                        principalTable: "BoardItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BoardRole",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoleName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BoardCollaboratorId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardRole", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardRole_BoardsCollaborators_BoardCollaboratorId",
                        column: x => x.BoardCollaboratorId,
                        principalTable: "BoardsCollaborators",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationUsers_TeamProjectId",
                table: "ApplicationUsers",
                column: "TeamProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardItemPosition_BoardItemId",
                table: "BoardItemPosition",
                column: "BoardItemId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BoardItems_BoardId",
                table: "BoardItems",
                column: "BoardId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardItems_OptionsId",
                table: "BoardItems",
                column: "OptionsId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardItems_TypeId",
                table: "BoardItems",
                column: "TypeId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardRole_BoardCollaboratorId",
                table: "BoardRole",
                column: "BoardCollaboratorId");

            migrationBuilder.CreateIndex(
                name: "IX_Boards_PermissionsId",
                table: "Boards",
                column: "PermissionsId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Boards_PreferencesId",
                table: "Boards",
                column: "PreferencesId");

            migrationBuilder.CreateIndex(
                name: "IX_Boards_ProjectId",
                table: "Boards",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Boards_TeamUserId",
                table: "Boards",
                column: "TeamUserId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardsCollaborators_BoardId",
                table: "BoardsCollaborators",
                column: "BoardId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardsCollaborators_UserId",
                table: "BoardsCollaborators",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardTeam_TeamsId",
                table: "BoardTeam",
                column: "TeamsId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamPermissions_TeamRoleId",
                table: "TeamPermissions",
                column: "TeamRoleId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeamProjects_TeamId",
                table: "TeamProjects",
                column: "TeamId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamRole_TeamId",
                table: "TeamRole",
                column: "TeamId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamRole_TeamUserId",
                table: "TeamRole",
                column: "TeamUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamUsers_ApplicationUserId",
                table: "TeamUsers",
                column: "ApplicationUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamUsers_TeamId",
                table: "TeamUsers",
                column: "TeamId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BoardItemPosition");

            migrationBuilder.DropTable(
                name: "BoardRole");

            migrationBuilder.DropTable(
                name: "BoardTeam");

            migrationBuilder.DropTable(
                name: "DeviceFlowCodes");

            migrationBuilder.DropTable(
                name: "EmailTokens");

            migrationBuilder.DropTable(
                name: "Keys");

            migrationBuilder.DropTable(
                name: "PersistedGrants");

            migrationBuilder.DropTable(
                name: "TeamPermissions");

            migrationBuilder.DropTable(
                name: "BoardItems");

            migrationBuilder.DropTable(
                name: "BoardsCollaborators");

            migrationBuilder.DropTable(
                name: "TeamRole");

            migrationBuilder.DropTable(
                name: "BoardItemOptions");

            migrationBuilder.DropTable(
                name: "BoardItemType");

            migrationBuilder.DropTable(
                name: "Boards");

            migrationBuilder.DropTable(
                name: "BoardPermissions");

            migrationBuilder.DropTable(
                name: "BoardUserPreferences");

            migrationBuilder.DropTable(
                name: "TeamUsers");

            migrationBuilder.DropTable(
                name: "ApplicationUsers");

            migrationBuilder.DropTable(
                name: "TeamProjects");

            migrationBuilder.DropTable(
                name: "Teams");
        }
    }
}
