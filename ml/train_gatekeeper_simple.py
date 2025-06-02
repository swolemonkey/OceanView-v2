#!/usr/bin/env python3
"""
Simplified RL Gatekeeper Model Script

This script creates a minimal valid ONNX model for development purposes.
"""

import os
import numpy as np
import argparse
import onnx
from onnx import helper, TensorProto

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Train a simple gatekeeper model')
    parser.add_argument('--output', type=str, default='ml/gatekeeper_v1.onnx',
                        help='Output path for the model file')
    args = parser.parse_args()
    
    output_path = args.output
    print(f"Creating minimal valid ONNX model at {output_path}...")
    
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Define a simple ONNX model with identity operation
    # This simulates a model that takes 6 inputs (for the 6 features we need)
    input_tensor = helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 6])
    output_tensor = helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 1])
    
    # Create a simple model that always returns a score of 0.7
    # This is a placeholder for actual ML logic
    constant = helper.make_node(
        'Constant',
        inputs=[],
        outputs=['constant'],
        value=helper.make_tensor(
            name='const_tensor',
            data_type=TensorProto.FLOAT,
            dims=[1, 1],
            vals=[0.7],
        )
    )
    
    identity = helper.make_node(
        'Identity',
        inputs=['constant'],
        outputs=['y']
    )
    
    # Create the graph and model
    graph_def = helper.make_graph(
        [constant, identity],
        "GatekeeperModel",
        [input_tensor],  # Input (not actually used but needed for API)
        [output_tensor]  # Output
    )
    
    # Create the model with opset version 22
    opset_imports = [helper.make_opsetid("", 22)]
    model_def = helper.make_model(graph_def, producer_name="gatekeeper-model", opset_imports=opset_imports)
    
    # Set IR version to 10 for compatibility
    model_def.ir_version = 10
    
    # Save the model
    onnx.save(model_def, output_path)
    
    file_size_kb = os.path.getsize(output_path) / 1024
    print(f"Valid ONNX model created at {output_path} (Size: {file_size_kb:.2f} kB)")
    print("This is a development placeholder - will always return score of 0.7")

if __name__ == "__main__":
    main() 