#!/usr/bin/env python3
"""
Train RL Gatekeeper Model

This script trains a logistic regression model for trade approval/rejection
and exports it as an ONNX model for use in the trading system.
"""

try:
    import pandas as pd
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score, confusion_matrix
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
except ImportError as e:
    print(f"Error importing required libraries: {e}")
    print("Please install the required dependencies with: pip install -r requirements.txt")
    exit(1)

def main():
    print("Loading dataset...")
    try:
        # Load data from CSV
        columns = ['symbol', 'rsi14', 'fastMA', 'slowMA', 'smcPattern', 'label', 'success']
        df = pd.read_csv('data_export.csv', names=columns)
        print(f"Dataset size: {len(df)}")
        print(f"Label distribution: {df['label'].value_counts()}")
        print(f"Success rate: {df['success'].mean():.2f}")
    except FileNotFoundError:
        print("Error: data_export.csv not found.")
        print("Please run: pnpm ts-node scripts/export_rl_dataset.ts first.")
        return

    # Select features and target
    X = df[['rsi14', 'fastMA', 'slowMA', 'smcPattern']]
    y = df['label']

    # Split into train and test sets (80/20)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    print(f"Training set size: {len(X_train)}, Test set size: {len(X_test)}")

    # Train logistic regression model
    print("Training model...")
    lr_model = LogisticRegression(class_weight='balanced')
    lr_model.fit(X_train, y_train)

    # Make predictions
    y_pred_proba = lr_model.predict_proba(X_test)[:, 1]  # Probability of class 1
    y_pred = lr_model.predict(X_test)

    # Calculate ROC AUC
    auc = roc_auc_score(y_test, y_pred_proba)
    print(f"ROC AUC: {auc:.4f}")  # Target >= 0.6

    # Display confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    print("Confusion Matrix:")
    print(cm)

    # Analyze feature importance
    feature_importance = pd.DataFrame({
        'Feature': X.columns,
        'Coefficient': lr_model.coef_[0]
    })
    feature_importance = feature_importance.sort_values('Coefficient', ascending=False)
    print("Feature Importance:")
    print(feature_importance)

    # Export model to ONNX format
    print("Exporting model to ONNX...")
    try:
        n_features = X.shape[1]
        initial_types = [('float_input', FloatTensorType([None, n_features]))]
        onx = convert_sklearn(lr_model, initial_types=initial_types)
        
        with open('gatekeeper_v1.onnx', 'wb') as f:
            f.write(onx.SerializeToString())

        print("Model exported to gatekeeper_v1.onnx")
    except Exception as e:
        print(f"Error exporting model to ONNX: {e}")
        print("Make sure skl2onnx and onnx are properly installed.")

if __name__ == "__main__":
    main() 