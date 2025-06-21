<?php

use Illuminate\Support\Facades\Route;
use Modules\HelloWorld\Http\Controllers\HelloWorldController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('helloworlds', HelloWorldController::class)->names('helloworld');
});
