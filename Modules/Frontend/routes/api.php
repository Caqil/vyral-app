<?php

use Illuminate\Support\Facades\Route;
use Modules\Frontend\Http\Controllers\FrontendController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('frontends', FrontendController::class)->names('frontend');
});
