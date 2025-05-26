#!/usr/bin/env python3
"""
Create a simple ONNX model for the gatekeeper
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Create a simple model
X = np.array([[0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]])
y = np.array([0, 0, 1])

# Train a logistic regression model
model = LogisticRegression()
model.fit(X, y)

# Convert to ONNX
n_features = X.shape[1]
onnx_model = convert_sklearn(
    model,
    initial_types=[('float_input', FloatTensorType([None, n_features]))]
)

# Save the model
with open('gatekeeper_v1.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())

print('✅ ONNX model saved successfully') 