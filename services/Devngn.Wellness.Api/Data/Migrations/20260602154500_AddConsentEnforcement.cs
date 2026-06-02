using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Devngn.Wellness.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddConsentEnforcement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_consent_records_UserId",
                schema: "wellness",
                table: "consent_records");

            migrationBuilder.RenameIndex(
                name: "IX_equipment_UserId_Tag",
                schema: "wellness",
                table: "equipment",
                newName: "ix_equipment_user_id_tag");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_consent_records_UserId",
                schema: "wellness",
                table: "consent_records",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_equipment_consent_records_UserId",
                schema: "wellness",
                table: "equipment",
                column: "UserId",
                principalSchema: "wellness",
                principalTable: "consent_records",
                principalColumn: "UserId",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_goals_consent_records_UserId",
                schema: "wellness",
                table: "goals",
                column: "UserId",
                principalSchema: "wellness",
                principalTable: "consent_records",
                principalColumn: "UserId",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_profiles_consent_records_UserId",
                schema: "wellness",
                table: "profiles",
                column: "UserId",
                principalSchema: "wellness",
                principalTable: "consent_records",
                principalColumn: "UserId",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_equipment_consent_records_UserId",
                schema: "wellness",
                table: "equipment");

            migrationBuilder.DropForeignKey(
                name: "FK_goals_consent_records_UserId",
                schema: "wellness",
                table: "goals");

            migrationBuilder.DropForeignKey(
                name: "FK_profiles_consent_records_UserId",
                schema: "wellness",
                table: "profiles");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_consent_records_UserId",
                schema: "wellness",
                table: "consent_records");

            migrationBuilder.RenameIndex(
                name: "ix_equipment_user_id_tag",
                schema: "wellness",
                table: "equipment",
                newName: "IX_equipment_UserId_Tag");

            migrationBuilder.CreateIndex(
                name: "IX_consent_records_UserId",
                schema: "wellness",
                table: "consent_records",
                column: "UserId",
                unique: true);
        }
    }
}
