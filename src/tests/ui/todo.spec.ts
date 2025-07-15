// tests/todo.spec.ts
import { LOCAL_STORAGE_ID, TODO_ITEMS } from "shared/mock-data";
import { test } from "./fixtures/todo-fixture";

import { checkNumberOfCompletedTodosInLocalStorage, checkNumberOfItemsInLocalStorage } from "shared/utils";
import { TAGS } from "@utils/constants";

test.describe("New Todo", () => {
	test(
		"should allow me to add todo items",
		{
			tag: [TAGS.CUSTOMER, TAGS.REGRESSION],
		},
		async ({ page, todoPage }) => {
			await todoPage.addTodo(TODO_ITEMS[0]);
			await todoPage.expectTodoTitles([TODO_ITEMS[0]]);
			await todoPage.addTodo(TODO_ITEMS[1]);
			await todoPage.expectTodoTitles([TODO_ITEMS[0], TODO_ITEMS[1]]);

			await checkNumberOfItemsInLocalStorage(page, 2, LOCAL_STORAGE_ID);
		},
	);

	test(
		"should clear text input field when an item is added",
		{
			tag: [TAGS.CUSTOMER, TAGS.SMOKE],
		},
		async ({ page, todoPage }) => {
			await todoPage.addTodo(TODO_ITEMS[0]);
			await todoPage.expectInputCleared();

			await checkNumberOfItemsInLocalStorage(page, 1, LOCAL_STORAGE_ID);
		},
	);

	test(
		"should append new items to the bottom of the list",
		{
			tag: [TAGS.CUSTOMER, TAGS.REGRESSION],
		},
		async ({ page, todoPage }) => {
			await todoPage.createDefaultTodos(TODO_ITEMS);

			await todoPage.expectTodoCountText("3 items left");
			await todoPage.expectTodoCount(3);
			await todoPage.expectTodoTitles(TODO_ITEMS);

			await checkNumberOfItemsInLocalStorage(page, 3, LOCAL_STORAGE_ID);
		},
	);
});

test.describe("Mark all as completed", () => {
	test.beforeEach(async ({ page, todoPage }) => {
		await todoPage.createDefaultTodos(TODO_ITEMS);
		await checkNumberOfItemsInLocalStorage(page, 3, LOCAL_STORAGE_ID);
	});

	test.afterEach(async ({ page }) => {
		await checkNumberOfItemsInLocalStorage(page, 3, LOCAL_STORAGE_ID);
	});

	test(
		"should allow me to mark all items as completed",
		{
			tag: [TAGS.INTERNAL, TAGS.SMOKE],
		},
		async ({ page, todoPage }) => {
			await todoPage.completeAllTodos();
			await todoPage.expectTodosCompletedState(["completed", "completed", "completed"]);
			await checkNumberOfCompletedTodosInLocalStorage(page, 3, LOCAL_STORAGE_ID);
		},
	);

	test(
		"should allow me to clear the complete state of all items",
		{
			tag: [TAGS.INTERNAL, TAGS.REGRESSION],
		},
		async ({ todoPage }) => {
			await todoPage.completeAllTodos();
			await todoPage.clearAllCompleted();
			await todoPage.expectTodosCompletedState(["", "", ""]);
		},
	);

	test(
		"complete all checkbox should update state when items are completed / cleared",
		{
			tag: [TAGS.INTERNAL, TAGS.SMOKE],
		},
		async ({ page, todoPage }) => {
			await todoPage.completeAllTodos();
			await todoPage.expectToggleAllChecked(true);
			await checkNumberOfCompletedTodosInLocalStorage(page, 3, LOCAL_STORAGE_ID);

			const firstCheckbox = todoPage.getTodoCheckbox(0);
			await firstCheckbox.uncheck();
			await todoPage.expectToggleAllChecked(false);

			await firstCheckbox.check();
			await checkNumberOfCompletedTodosInLocalStorage(page, 3, LOCAL_STORAGE_ID);
			await todoPage.expectToggleAllChecked(true);
		},
	);
});
