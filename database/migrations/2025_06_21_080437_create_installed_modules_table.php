<?php
// database/migrations/xxxx_create_installed_modules_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::create('installed_modules', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('alias')->unique();
            $table->string('description')->nullable();
            $table->string('version')->default('1.0.0');
            $table->string('author')->nullable();
            $table->string('author_email')->nullable();
            $table->json('providers')->nullable();
            $table->json('requirements')->nullable();
            $table->boolean('is_enabled')->default(false);
            $table->boolean('is_core')->default(false);
            $table->string('path');
            $table->string('namespace')->default('Modules');
            $table->timestamp('installed_at');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('installed_modules');
    }
};