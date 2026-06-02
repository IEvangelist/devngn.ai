using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Devngn.Wellness.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "wellness");

            migrationBuilder.CreateTable(
                name: "activities",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Slug = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    BodyArea = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Intensity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    EquipmentTags = table.Column<string[]>(type: "text[]", nullable: false),
                    AnimationProvider = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    AnimationAssetId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    LicenseAttribution = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_activities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GitHubId = table.Column<long>(type: "bigint", nullable: false),
                    Login = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    AvatarUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "consent_records",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Text = table.Column<string>(type: "text", nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_consent_records", x => x.Id);
                    table.ForeignKey(
                        name: "FK_consent_records_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "equipment",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Tag = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_equipment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_equipment_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "goals",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Category = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    TargetMetric = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goals_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "profiles",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgeRange = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    HeightCm = table.Column<decimal>(type: "numeric(5,2)", nullable: true),
                    WeightKg = table.Column<decimal>(type: "numeric(5,2)", nullable: true),
                    FitnessBaseline = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PreferredIntensity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Limitations = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    TimeOfDayPreference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_profiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_profiles_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "prompts",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityId = table.Column<Guid>(type: "uuid", nullable: false),
                    GapStartUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    GapEndUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeliveredVia = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DismissedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FeedbackRating = table.Column<short>(type: "smallint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_prompts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_prompts_activities_ActivityId",
                        column: x => x.ActivityId,
                        principalSchema: "wellness",
                        principalTable: "activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_prompts_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "schedule_sources",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CredentialRef = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LastSyncAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_schedule_sources", x => x.Id);
                    table.ForeignKey(
                        name: "FK_schedule_sources_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "schedule_events",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Busy = table.Column<bool>(type: "boolean", nullable: false),
                    ExternalId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IngestedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_schedule_events", x => x.Id);
                    table.ForeignKey(
                        name: "FK_schedule_events_schedule_sources_SourceId",
                        column: x => x.SourceId,
                        principalSchema: "wellness",
                        principalTable: "schedule_sources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_schedule_events_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_activities_BodyArea_Intensity",
                schema: "wellness",
                table: "activities",
                columns: new[] { "BodyArea", "Intensity" });

            migrationBuilder.CreateIndex(
                name: "IX_activities_Slug",
                schema: "wellness",
                table: "activities",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_consent_records_UserId",
                schema: "wellness",
                table: "consent_records",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_equipment_UserId_Tag",
                schema: "wellness",
                table: "equipment",
                columns: new[] { "UserId", "Tag" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_goals_UserId_Category",
                schema: "wellness",
                table: "goals",
                columns: new[] { "UserId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_profiles_UserId",
                schema: "wellness",
                table: "profiles",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_prompts_ActivityId",
                schema: "wellness",
                table: "prompts",
                column: "ActivityId");

            migrationBuilder.CreateIndex(
                name: "IX_prompts_UserId_DeliveredAt",
                schema: "wellness",
                table: "prompts",
                columns: new[] { "UserId", "DeliveredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_schedule_events_SourceId_ExternalId",
                schema: "wellness",
                table: "schedule_events",
                columns: new[] { "SourceId", "ExternalId" },
                unique: true,
                filter: "\"ExternalId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_schedule_events_UserId_StartUtc_EndUtc",
                schema: "wellness",
                table: "schedule_events",
                columns: new[] { "UserId", "StartUtc", "EndUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_schedule_sources_UserId_Type",
                schema: "wellness",
                table: "schedule_sources",
                columns: new[] { "UserId", "Type" });

            migrationBuilder.CreateIndex(
                name: "IX_users_GitHubId",
                schema: "wellness",
                table: "users",
                column: "GitHubId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_Login",
                schema: "wellness",
                table: "users",
                column: "Login");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "consent_records",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "equipment",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "goals",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "profiles",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "prompts",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "schedule_events",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "activities",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "schedule_sources",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "users",
                schema: "wellness");
        }
    }
}
