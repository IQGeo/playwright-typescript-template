import { APIRequestContext } from "@playwright/test";

export class UserApi {
	private readonly url;
	constructor(private request: APIRequestContext) {
		this.url = process.env.API_BASE_URL;
	}

	async getUser(id: number) {
		const response = await this.request.get(`${this.url}/users/${id}`);
		return response;
	}

	async createUser(data: any) {
		const response = await this.request.post(`${this.url}/users`, { data });
		return response;
	}
}
