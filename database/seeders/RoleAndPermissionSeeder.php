<?php
// database/seeders/RoleAndPermissionSeeder.php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;
use App\Models\User;

class RoleAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Create permissions
        $permissions = [
            'view users',
            'create users',
            'edit users',
            'delete users',
            'manage roles',
            'manage permissions',
            'access admin panel',
            'manage modules',
            'manage themes',
            'manage plugins',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission]);
        }

        // Create roles
        $adminRole = Role::firstOrCreate(['name' => 'admin']);
        $moderatorRole = Role::firstOrCreate(['name' => 'moderator']);
        $userRole = Role::firstOrCreate(['name' => 'user']);

        // Assign permissions to roles
        $adminRole->givePermissionTo(Permission::all());
        $moderatorRole->givePermissionTo(['view users', 'access admin panel']);
        $userRole->givePermissionTo(['view users']);

        // Create admin user
        $admin = User::firstOrCreate([
            'email' => 'admin@example.com'
        ], [
            'name' => 'Administrator',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'password' => bcrypt('password'),
            'is_active' => true,
        ]);

        $admin->assignRole('admin');

        // Create test user
        $user = User::firstOrCreate([
            'email' => 'user@example.com'
        ], [
            'name' => 'Test User',
            'first_name' => 'Test',
            'last_name' => 'User',
            'password' => bcrypt('password'),
            'is_active' => true,
        ]);

        $user->assignRole('user');
    }
}