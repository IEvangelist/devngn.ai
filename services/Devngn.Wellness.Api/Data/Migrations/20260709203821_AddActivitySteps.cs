using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Devngn.Wellness.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddActivitySteps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Steps",
                schema: "wellness",
                table: "activities",
                type: "jsonb",
                nullable: false,
                defaultValueSql: "'[]'::jsonb");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Steps",
                schema: "wellness",
                table: "activities");
        }
    }
}
