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
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    BodyArea = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Intensity = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    DurationSeconds = table.Column<int>(type: "int", nullable: false),
                    EquipmentTags = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AnimationProvider = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    AnimationAssetId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LicenseAttribution = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Steps = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_activities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "badge_definitions",
                schema: "wellness",
                columns: table => new
                {
                    Key = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Icon = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    XpThreshold = table.Column<int>(type: "int", nullable: false),
                    IsHidden = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_badge_definitions", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "data_protection_keys",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FriendlyName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Xml = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_data_protection_keys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "milestone_definitions",
                schema: "wellness",
                columns: table => new
                {
                    Key = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsHidden = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_milestone_definitions", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "users",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GitHubId = table.Column<long>(type: "bigint", nullable: false),
                    Login = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    AvatarUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
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
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_consent_records", x => x.Id);
                    table.UniqueConstraint("AK_consent_records_UserId", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_consent_records_users_UserId",
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
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GapStartUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    GapEndUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DeliveredVia = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    DismissedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
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
                name: "schedule_oauth_states",
                schema: "wellness",
                columns: table => new
                {
                    State = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CodeVerifier = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReturnPath = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ConsumedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
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

            migrationBuilder.CreateTable(
                name: "activity_feed_items",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Metadata = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_activity_feed_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_activity_feed_items_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "equipment",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Tag = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_equipment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_equipment_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_equipment_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "follows",
                schema: "wellness",
                columns: table => new
                {
                    FollowerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FolloweeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_follows", x => new { x.FollowerId, x.FolloweeId });
                    table.ForeignKey(
                        name: "FK_follows_consent_records_FolloweeId",
                        column: x => x.FolloweeId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId");
                    table.ForeignKey(
                        name: "FK_follows_consent_records_FollowerId",
                        column: x => x.FollowerId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId");
                });

            migrationBuilder.CreateTable(
                name: "goals",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    TargetMetric = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goals_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_goals_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "player_states",
                schema: "wellness",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TotalXp = table.Column<int>(type: "int", nullable: false),
                    Level = table.Column<int>(type: "int", nullable: false),
                    CurrentStreak = table.Column<int>(type: "int", nullable: false),
                    LongestStreak = table.Column<int>(type: "int", nullable: false),
                    LastActivityOn = table.Column<DateOnly>(type: "date", nullable: true),
                    RankTier = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player_states", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_player_states_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "profiles",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgeRange = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    HeightCm = table.Column<decimal>(type: "decimal(5,2)", nullable: true),
                    WeightKg = table.Column<decimal>(type: "decimal(5,2)", nullable: true),
                    FitnessBaseline = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    PreferredIntensity = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Limitations = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    TimeOfDayPreference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_profiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_profiles_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_profiles_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "schedule_sources",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CredentialRef = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ProtectedRefreshToken = table.Column<string>(type: "nvarchar(max)", maxLength: 8000, nullable: true),
                    Scope = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    LastRefreshAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LastSyncErrorCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    LastSyncErrorAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ConnectionStatus = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    LastSyncAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_schedule_sources", x => x.Id);
                    table.UniqueConstraint("AK_schedule_sources_Id_UserId", x => new { x.Id, x.UserId });
                    table.ForeignKey(
                        name: "FK_schedule_sources_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_schedule_sources_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "social_profiles",
                schema: "wellness",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Bio = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IsPublic = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_social_profiles", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_social_profiles_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_badges",
                schema: "wellness",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BadgeKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    EarnedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_badges", x => new { x.UserId, x.BadgeKey });
                    table.ForeignKey(
                        name: "FK_user_badges_badge_definitions_BadgeKey",
                        column: x => x.BadgeKey,
                        principalSchema: "wellness",
                        principalTable: "badge_definitions",
                        principalColumn: "Key",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_badges_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_milestones",
                schema: "wellness",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MilestoneKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    AchievedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_milestones", x => new { x.UserId, x.MilestoneKey });
                    table.ForeignKey(
                        name: "FK_user_milestones_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_milestones_milestone_definitions_MilestoneKey",
                        column: x => x.MilestoneKey,
                        principalSchema: "wellness",
                        principalTable: "milestone_definitions",
                        principalColumn: "Key",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "xp_events",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_xp_events", x => x.Id);
                    table.ForeignKey(
                        name: "FK_xp_events_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "schedule_events",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StartUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Busy = table.Column<bool>(type: "bit", nullable: false),
                    ExternalId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    IngestedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_schedule_events", x => x.Id);
                    table.ForeignKey(
                        name: "FK_schedule_events_consent_records_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId");
                    table.ForeignKey(
                        name: "FK_schedule_events_schedule_sources_SourceId_UserId",
                        columns: x => new { x.SourceId, x.UserId },
                        principalSchema: "wellness",
                        principalTable: "schedule_sources",
                        principalColumns: new[] { "Id", "UserId" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_schedule_events_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "wellness",
                        principalTable: "users",
                        principalColumn: "Id");
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
                name: "IX_activity_feed_items_UserId_CreatedAt",
                schema: "wellness",
                table: "activity_feed_items",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_badge_definitions_IsHidden",
                schema: "wellness",
                table: "badge_definitions",
                column: "IsHidden");

            migrationBuilder.CreateIndex(
                name: "IX_data_protection_keys_FriendlyName",
                schema: "wellness",
                table: "data_protection_keys",
                column: "FriendlyName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_equipment_user_id_tag",
                schema: "wellness",
                table: "equipment",
                columns: new[] { "UserId", "Tag" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_follows_FolloweeId",
                schema: "wellness",
                table: "follows",
                column: "FolloweeId");

            migrationBuilder.CreateIndex(
                name: "IX_follows_FollowerId",
                schema: "wellness",
                table: "follows",
                column: "FollowerId");

            migrationBuilder.CreateIndex(
                name: "IX_goals_UserId_Category",
                schema: "wellness",
                table: "goals",
                columns: new[] { "UserId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_milestone_definitions_IsHidden",
                schema: "wellness",
                table: "milestone_definitions",
                column: "IsHidden");

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
                filter: "[ExternalId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_schedule_events_SourceId_UserId",
                schema: "wellness",
                table: "schedule_events",
                columns: new[] { "SourceId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_schedule_events_UserId_StartUtc_EndUtc",
                schema: "wellness",
                table: "schedule_events",
                columns: new[] { "UserId", "StartUtc", "EndUtc" });

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

            migrationBuilder.CreateIndex(
                name: "IX_schedule_sources_UserId_Type",
                schema: "wellness",
                table: "schedule_sources",
                columns: new[] { "UserId", "Type" });

            migrationBuilder.CreateIndex(
                name: "IX_social_profiles_IsPublic",
                schema: "wellness",
                table: "social_profiles",
                column: "IsPublic");

            migrationBuilder.CreateIndex(
                name: "IX_user_badges_BadgeKey",
                schema: "wellness",
                table: "user_badges",
                column: "BadgeKey");

            migrationBuilder.CreateIndex(
                name: "IX_user_badges_UserId_EarnedAt",
                schema: "wellness",
                table: "user_badges",
                columns: new[] { "UserId", "EarnedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_user_milestones_MilestoneKey",
                schema: "wellness",
                table: "user_milestones",
                column: "MilestoneKey");

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

            migrationBuilder.CreateIndex(
                name: "IX_xp_events_UserId_CreatedAt",
                schema: "wellness",
                table: "xp_events",
                columns: new[] { "UserId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "activity_feed_items",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "data_protection_keys",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "equipment",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "follows",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "goals",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "player_states",
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
                name: "schedule_oauth_states",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "social_profiles",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "user_badges",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "user_milestones",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "xp_events",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "activities",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "schedule_sources",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "badge_definitions",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "milestone_definitions",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "consent_records",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "users",
                schema: "wellness");
        }
    }
}
