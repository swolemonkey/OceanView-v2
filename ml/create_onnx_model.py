#!/usr/bin/env python3
"""
Create a valid ONNX model for Gatekeeper

This script creates a simple logistic regression model and exports it to ONNX format.
"""

import numpy as np
import os
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
import onnx
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Create a synthetic dataset for a binary classification problem
# We'll use 4 features to match our gatekeeper requirements
X, y = make_classification(
    n_samples=1000,
    n_features=4,
    n_informative=4,
    n_redundant=0,
    n_clusters_per_class=1,
    random_state=42
)

# Split the data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a logistic regression model
model = LogisticRegression(max_iter=400, n_jobs=1)
model.fit(X_train, y_train)

# Convert the model to ONNX format
initial_types = [('float_input', FloatTensorType([None, 4]))]
onnx_model = convert_sklearn(model, initial_types=initial_types, target_opset=13)

# Save the ONNX model
output_path = "ml/gatekeeper_v1.onnx"
onnx.save_model(onnx_model, output_path)

# Print file information
file_size = os.path.getsize(output_path)
print(f"✅ Saved ONNX model to {output_path} ({file_size} bytes)")

# Verify the model can be loaded
try:
    import onnxruntime as ort
    onnx.checker.check_model(output_path)
    ort.InferenceSession(output_path)
    print("ONNX OK - Model validated successfully")
except Exception as e:
    print(f"Error validating model: {e}") 