using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Devngn.Wellness.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddScheduleSourcesPhase7a : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_schedule_events_schedule_sources_SourceId",
                schema: "wellness",
                table: "schedule_events");

            migrationBuilder.AddColumn<string>(
                name: "ConnectionStatus",
                schema: "wellness",
                table: "schedule_sources",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Connected");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastRefreshAt",
                schema: "wellness",
                table: "schedule_sources",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastSyncErrorAt",
                schema: "wellness",
                table: "schedule_sources",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastSyncErrorCode",
                schema: "wellness",
                table: "schedule_sources",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProtectedRefreshToken",
                schema: "wellness",
                table: "schedule_sources",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Scope",
                schema: "wellness",
                table: "schedule_sources",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_schedule_sources_Id_UserId",
                schema: "wellness",
                table: "schedule_sources",
                columns: new[] { "Id", "UserId" });

            migrationBuilder.CreateTable(
                name: "data_protection_keys",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FriendlyName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Xml = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now() at time zone 'utc'")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_data_protection_keys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "schedule_oauth_states",
                schema: "wellness",
                columns: table => new
                {
                    State = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Provider = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CodeVerifier = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ReturnPath = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConsumedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_schedule_oauth_states", x => x.State);
                    table.ForeignKey(
                        name: "FK_schedule_oauth_states_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_schedule_events_SourceId_UserId",
                schema: "wellness",
                table: "schedule_events",
                columns: new[] { "SourceId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_data_protection_keys_FriendlyName",
                schema: "wellness",
                table: "data_protection_keys",
                column: "FriendlyName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_schedule_oauth_states_ExpiresAt",
                schema: "wellness",
                table: "schedule_oauth_states",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_schedule_oauth_states_UserId",
                schema: "wellness",
                table: "schedule_oauth_states",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_schedule_events_consent_records_UserId",
                schema: "wellness",
                table: "schedule_events",
                column: "UserId",
                principalSchema: "wellness",
                principalTable: "consent_records",
                principalColumn: "UserId",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_schedule_events_schedule_sources_SourceId_UserId",
                schema: "wellness",
                table: "schedule_events",
                columns: new[] { "SourceId", "UserId" },
                principalSchema: "wellness",
                principalTable: "schedule_sources",
                principalColumns: new[] { "Id", "UserId" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_schedule_sources_consent_records_UserId",
                schema: "wellness",
                table: "schedule_sources",
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
                name: "FK_schedule_events_consent_records_UserId",
                schema: "wellness",
                table: "schedule_events");

            migrationBuilder.DropForeignKey(
                name: "FK_schedule_events_schedule_sources_SourceId_UserId",
                schema: "wellness",
                table: "schedule_events");

            migrationBuilder.DropForeignKey(
                name: "FK_schedule_sources_consent_records_UserId",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.DropTable(
                name: "data_protection_keys",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "schedule_oauth_states",
                schema: "wellness");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_schedule_sources_Id_UserId",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.DropIndex(
                name: "IX_schedule_events_SourceId_UserId",
                schema: "wellness",
                table: "schedule_events");

            migrationBuilder.DropColumn(
                name: "ConnectionStatus",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.DropColumn(
                name: "LastRefreshAt",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.DropColumn(
                name: "LastSyncErrorAt",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.DropColumn(
                name: "LastSyncErrorCode",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.DropColumn(
                name: "ProtectedRefreshToken",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.DropColumn(
                name: "Scope",
                schema: "wellness",
                table: "schedule_sources");

            migrationBuilder.AddForeignKey(
                name: "FK_schedule_events_schedule_sources_SourceId",
                schema: "wellness",
                table: "schedule_events",
                column: "SourceId",
                principalSchema: "wellness",
                principalTable: "schedule_sources",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
