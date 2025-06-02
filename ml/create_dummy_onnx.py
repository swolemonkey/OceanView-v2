#!/usr/bin/env python3
"""
Create a minimal valid ONNX model for development testing
"""

import onnx
from onnx import helper, TensorProto
import os

# Define the model structure: input -> identity -> output
input_tensor = helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 6])
output_tensor = helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 6])

node_def = helper.make_node(
    "Identity",    # operator name
    inputs=["x"],
    outputs=["y"]
)

graph_def = helper.make_graph(
    [node_def],
    "MinimalIdentityGraph",
    [input_tensor],
    [output_tensor]
)

# Create the model with opset version 22
opset_imports = [helper.make_opsetid("", 22)]
model_def = helper.make_model(graph_def, producer_name="onnx-placeholder", opset_imports=opset_imports)

# Explicitly set IR version to 10 for compatibility with onnxruntime-node 1.22.0
model_def.ir_version = 10

# Save the model
os.makedirs("ml", exist_ok=True)
onnx.save(model_def, "ml/gatekeeper_v1.onnx")
print("✅ Minimal ONNX model saved at ml/gatekeeper_v1.onnx") 