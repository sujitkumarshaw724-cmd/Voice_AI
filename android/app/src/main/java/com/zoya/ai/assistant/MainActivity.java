package com.zoya.ai.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZoyaAutomationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
