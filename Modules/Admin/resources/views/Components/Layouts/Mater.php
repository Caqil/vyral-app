<?php

namespace Modules\Admin\app\View\Components\Layouts;

use Illuminate\View\Component;
use Illuminate\View\View;

class Master extends Component
{
    /**
     * Get the view / contents that represents the component.
     */
    public function render(): View
    {
        return view('admin::layouts.master');
    }
}