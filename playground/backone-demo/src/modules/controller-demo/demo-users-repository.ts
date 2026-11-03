export interface DemoUser {
  id: number;
  name: string;
}

/** 独立演示内存 Repository，每个应用拥有自己的数据。 */
export class DemoUsersRepository {
  private readonly users = new Map<number, DemoUser>([
    [1, { id: 1, name: 'Alice' }],
  ]);
  private nextId = 2;

  list(): DemoUser[] {
    return [...this.users.values()];
  }
  find(id: number): DemoUser | null {
    return this.users.get(id) ?? null;
  }
  create(name: string): DemoUser {
    const user = { id: this.nextId++, name };
    this.users.set(user.id, user);
    return user;
  }
}
