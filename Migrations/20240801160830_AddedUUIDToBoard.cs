using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Frogmarks.Migrations
{
    /// <inheritdoc />
    public partial class AddedUUIDToBoard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "UUID",
                table: "Boards",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UUID",
                table: "Boards");
        }
    }
}
