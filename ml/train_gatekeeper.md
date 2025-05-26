# Train RL Gatekeeper Model

## Import Libraries
```python
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, confusion_matrix
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
```

## Load Dataset
```python
# Load data from CSV
columns = ['symbol', 'rsi14', 'fastMA', 'slowMA', 'smcPattern', 'label', 'success']
df = pd.read_csv('data_export.csv', names=columns)
print(f"Dataset size: {len(df)}")
print(f"Label distribution: {df['label'].value_counts()}")
```

## Prepare Features and Target
```python
# Select features and target
X = df[['rsi14', 'fastMA', 'slowMA', 'smcPattern']]
y = df['label']

# Split into train and test sets (80/20)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
```

## Train Logistic Regression Model
```python
# Train logistic regression model
lr_model = LogisticRegression(class_weight='balanced')
lr_model.fit(X_train, y_train)

# Make predictions
y_pred_proba = lr_model.predict_proba(X_test)[:, 1]  # Probability of class 1
```

## Evaluate Model Performance
```python
# Calculate ROC AUC
auc = roc_auc_score(y_test, y_pred_proba)
print(f"ROC AUC: {auc:.4f}")  # Target >= 0.6
```

## Export Model to ONNX
```python
# Export model to ONNX format
n_features = X.shape[1]
onx = convert_sklearn(lr_model, initial_types=[('float_input', FloatTensorType([None, n_features]))])
with open('gatekeeper_v1.onnx', 'wb') as f:
    f.write(onx.SerializeToString())

print("Model exported to gatekeeper_v1.onnx")
``` 