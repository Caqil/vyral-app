<?php

use Illuminate\Support\Facades\Route;
use Modules\HelloWorld\app\Http\Controllers\HelloWorldController;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
*/

Route::prefix('hello')->name('hello.')->group(function () {
    Route::get('/', [HelloWorldController::class, 'index'])->name('index');
    Route::get('/about', [HelloWorldController::class, 'about'])->name('about');
});