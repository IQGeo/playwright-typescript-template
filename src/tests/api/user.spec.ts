import { test, expect } from "@playwright/test";
import { TAGS } from "@utils/constants";
import { UserApi } from "pages/api";
import { User } from "shared/types";

test.describe("User API Tests", () => {
	let userApi: UserApi;

	test.beforeEach(async ({ request }) => {
		userApi = new UserApi(request);
	});

	test(
		"should fetch user by ID",
		{
			tag: TAGS.REGRESSION,
		},
		async () => {
			const response = await userApi.getUser(1);
			const user = await response.json();
			expect(response.ok()).toBeTruthy();
			expect(user.name).toBeDefined();
		},
	);

	test(
		"should create a new user",
		{
			tag: TAGS.INTERNAL,
		},
		async () => {
			const newUser: User = {
				name: "John Doe",
				email: "john@example.com",
			};
			const response = await userApi.createUser(newUser);
			const user = await response.json();
			expect(response.ok()).toBeTruthy();
			expect(user.name).toBe("John Doe");
		},
	);
});
