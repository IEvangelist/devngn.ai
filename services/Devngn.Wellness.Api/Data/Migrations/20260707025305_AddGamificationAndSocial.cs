using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Devngn.Wellness.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGamificationAndSocial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "activity_feed_items",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true)
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
                name: "badge_definitions",
                schema: "wellness",
                columns: table => new
                {
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Icon = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    XpThreshold = table.Column<int>(type: "integer", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_badge_definitions", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "follows",
                schema: "wellness",
                columns: table => new
                {
                    FollowerId = table.Column<Guid>(type: "uuid", nullable: false),
                    FolloweeId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_follows", x => new { x.FollowerId, x.FolloweeId });
                    table.ForeignKey(
                        name: "FK_follows_consent_records_FolloweeId",
                        column: x => x.FolloweeId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_follows_consent_records_FollowerId",
                        column: x => x.FollowerId,
                        principalSchema: "wellness",
                        principalTable: "consent_records",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "milestone_definitions",
                schema: "wellness",
                columns: table => new
                {
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_milestone_definitions", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "player_states",
                schema: "wellness",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TotalXp = table.Column<int>(type: "integer", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    CurrentStreak = table.Column<int>(type: "integer", nullable: false),
                    LongestStreak = table.Column<int>(type: "integer", nullable: false),
                    LastActivityOn = table.Column<DateOnly>(type: "date", nullable: true),
                    RankTier = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
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
                name: "social_profiles",
                schema: "wellness",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Bio = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false)
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
                name: "xp_events",
                schema: "wellness",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
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
                name: "user_badges",
                schema: "wellness",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    BadgeKey = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    EarnedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
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
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MilestoneKey = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    AchievedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
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
                name: "IX_milestone_definitions_IsHidden",
                schema: "wellness",
                table: "milestone_definitions",
                column: "IsHidden");

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
                name: "follows",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "player_states",
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
                name: "badge_definitions",
                schema: "wellness");

            migrationBuilder.DropTable(
                name: "milestone_definitions",
                schema: "wellness");
        }
    }
}
