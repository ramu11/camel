/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.camel.component.mcp.server;

import java.util.List;
import java.util.Map;

import org.apache.camel.CamelContext;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.test.junit6.CamelTestSupport;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class McpServerBridgePromptTest extends CamelTestSupport {

    private RecordingMcpServerEngine engine;

    @Override
    protected CamelContext createCamelContext() throws Exception {
        CamelContext answer = super.createCamelContext();
        engine = new RecordingMcpServerEngine();
        answer.getRegistry().bind("mcpServerEngine", engine);
        McpServerConfiguration configuration = new McpServerConfiguration();
        configuration.setTags("prompt-tests");
        configuration.setPromptTimeout(2000);
        answer.addService(new McpServerBridge(configuration));
        return answer;
    }

    @Override
    protected RouteBuilder createRouteBuilder() {
        return new RouteBuilder() {
            @Override
            public void configure() {
                from("ai-prompt:greeting?tags=prompt-tests&description=Greeting"
                     + "&argument.name.required=true")
                        .routeId("greeting-route")
                        .setBody(simple("Hello ${header.name}"));

                from("ai-prompt:multi_turn?tags=prompt-tests")
                        .setBody(constant(List.of(
                                "Plain user message",
                                Map.of("role", "assistant", "content", "Assistant reply"))));
            }
        };
    }

    @Test
    void promptIsPublishedAndReturnsMessages() {
        McpServerPrompt prompt = engine.prompts().get("greeting");
        assertThat(prompt).isNotNull();
        assertThat(prompt.description()).isEqualTo("Greeting");

        McpPromptResult result = prompt.handler().get(Map.of("name", "Ada"));

        assertThat(result.isError()).isFalse();
        assertThat(result.messages()).containsExactly(new McpPromptMessage("user", "Hello Ada"));
    }

    @Test
    void listResultSupportsUserAndAssistantMessages() {
        McpPromptResult result = engine.prompts().get("multi_turn").handler().get(Map.of());

        assertThat(result.isError()).isFalse();
        assertThat(result.messages()).containsExactly(
                new McpPromptMessage("user", "Plain user message"),
                new McpPromptMessage("assistant", "Assistant reply"));
    }

    @Test
    void missingRequiredArgumentIsAnArgumentError() {
        McpPromptResult result = engine.prompts().get("greeting").handler().get(Map.of());

        assertThat(result.isError()).isTrue();
        assertThat(result.argumentError()).isTrue();
        assertThat(result.errorMessage()).contains("Missing required argument 'name'");
    }

    @Test
    void promptIsRemovedWhenRouteStops() throws Exception {
        context.getRouteController().stopRoute("greeting-route");
        assertThat(engine.prompts()).doesNotContainKey("greeting");
    }
}
