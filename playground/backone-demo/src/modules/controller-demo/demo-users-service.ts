import { DemoError } from '../../errors';
import type { DemoUsersRepository, DemoUser } from './demo-users-repository';

export class DemoUsersService {
  constructor(private readonly users: DemoUsersRepository) {}
  list(): DemoUser[] {
    return this.users.list();
  }
  find(id: string): DemoUser {
    const user = this.users.find(Number(id));
    if (!user) throw new DemoError('NOT_FOUND', 'User not found');
    return user;
  }
  create(name: string): DemoUser {
    return this.users.create(name);
  }
}
