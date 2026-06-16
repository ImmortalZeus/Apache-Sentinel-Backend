import { userExists, createUser } from './services/auth.service';

export async function seedAdmin() {
  try {
    const exists = await userExists('admin');
    if (exists) {
      console.log('[Seed] Admin user already exists');
      return;
    }

    await createUser('admin', 'admin', 'admin');
    console.log('[Seed] Admin user created (admin/admin)');
  } catch (error) {
    console.error('[Seed] Failed to seed admin:', error);
  }
}
