#!/usr/bin/env python3
"""
Train RL Gatekeeper Model

This script trains a logistic regression model for trade approval/rejection
and exports it as an ONNX model for use in the trading system.
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve
from sklearn.model_selection import train_test_split
import onnx
import skl2onnx
from skl2onnx.common.data_types import FloatTensorType
import sqlite3

# Load the dataset
try:
    df = pd.read_csv('ml/data_export.csv', header=None)
    df.columns = ['rsi14', 'adx14', 'fastMASlowDelta', 'bbWidth', 'avgSent', 'avgOB', 'action', 'outcome']
    print(f"Loaded dataset with {len(df)} samples")
except Exception as e:
    print(f"Error loading dataset: {e}")
    # Create a small synthetic dataset for testing
    np.random.seed(42)
    n_samples = 100
    df = pd.DataFrame({
        'rsi14': np.random.uniform(0, 100, n_samples),
        'adx14': np.random.uniform(0, 100, n_samples),
        'fastMASlowDelta': np.random.uniform(-0.05, 0.05, n_samples),
        'bbWidth': np.random.uniform(0, 0.1, n_samples),
        'avgSent': np.random.uniform(-1, 1, n_samples),
        'avgOB': np.random.uniform(-1, 1, n_samples),
        'action': np.random.randint(0, 2, n_samples),
        'outcome': np.random.randint(0, 2, n_samples)
    })
    print("Created synthetic dataset for testing")

# Split into features and target
X = df.iloc[:, :-1].values
y = df.iloc[:, -1].values

# Split into training and test sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train logistic regression model
model = LogisticRegression(max_iter=1000)
model.fit(X_train, y_train)

# Evaluate model
y_pred_proba = model.predict_proba(X_test)[:, 1]
auc = roc_auc_score(y_test, y_pred_proba)
print(f'AUC: {auc:.4f}')

# Convert model to ONNX format
initial_types = [('input', FloatTensorType([None, X.shape[1]]))]
onnx_model = skl2onnx.convert_sklearn(model, initial_types=initial_types, target_opset=22)

# Set IR version to 10 for compatibility with onnxruntime-node 1.22.0
onnx_model.ir_version = 10

# Save the model
with open('ml/gatekeeper_v1.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())
    
print(f'Model saved as ml/gatekeeper_v1.onnx with AUC {auc:.4f}')

# Feature importance
feature_names = ['rsi14', 'adx14', 'fastMASlowDelta', 'bbWidth', 'avgSent', 'avgOB', 'action']
importance = pd.DataFrame({
    'Feature': feature_names,
    'Coefficient': model.coef_[0]
})
importance = importance.sort_values('Coefficient', ascending=False)
print("\nFeature Importance:")
for _, row in importance.iterrows():
    print(f"{row['Feature']}: {row['Coefficient']:.4f}")

# Insert model into database
try:
    conn = sqlite3.connect('prisma/dev.db')
    cursor = conn.cursor()

    # Check if model already exists
    cursor.execute("SELECT * FROM RLModel WHERE version = 'gatekeeper_v1'")
    existing_model = cursor.fetchone()

    if existing_model:
        print(f"Model 'gatekeeper_v1' already exists in database")
    else:
        cursor.execute(
            "INSERT INTO RLModel (version, path, description) VALUES (?, ?, ?)",
            ('gatekeeper_v1', 'ml/gatekeeper_v1.onnx', f'LR baseline AUC {auc:.2f}')
        )
        conn.commit()
        print("Inserted model into database")

    conn.close()
except Exception as e:
    print(f"Error accessing database: {e}")
    print("Continuing without database update")

if __name__ == "__main__":
    pass  # Script already runs in the main body 