<?php
// app/Models/InstalledModule.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

class InstalledModule extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'alias',
        'description',
        'version',
        'author',
        'author_email',
        'providers',
        'requirements',
        'is_enabled',
        'is_core',
        'path',
        'namespace',
        'installed_at',
    ];

    protected $casts = [
        'providers' => 'array',
        'requirements' => 'array',
        'is_enabled' => 'boolean',
        'is_core' => 'boolean',
        'installed_at' => 'datetime',
    ];

    public function getStatusAttribute(): string
    {
        return $this->is_enabled ? 'enabled' : 'disabled';
    }

    public function getStatusColorAttribute(): string
    {
        return $this->is_enabled ? 'green' : 'red';
    }

    public function getInstallationDateAttribute(): string
    {
        return $this->installed_at->format('M d, Y');
    }

    public function canBeDisabled(): bool
    {
        return !$this->is_core;
    }

    public function canBeDeleted(): bool
    {
        return !$this->is_core && !$this->is_enabled;
    }
}