import { TAGS } from "@utils/constants";
import { test } from "./fixtures/home-fixture";

test.describe("Home", () => {
	test(
		"has title",
		{
			tag: TAGS.SMOKE,
		},
		async ({ homePage }) => {
			await homePage.expectToHaveTitle(/Playwright/);
		},
	);

	test(
		"get started link navigates to Installation section",
		{
			tag: TAGS.SMOKE,
		},
		async ({ homePage }) => {
			await homePage.clickGetStarted();
			await homePage.expectInstallationHeadingVisible();
		},
	);
});
