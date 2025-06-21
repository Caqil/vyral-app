<?php

use Illuminate\Support\Facades\Route;
use Modules\Frontend\app\Http\Controllers\HomeController;

Route::get('/', [HomeController::class, 'index'])->name('home');